const cron = require("node-cron");
const TrackedItem = require("../models/TrackedItem");
const PriceCheck = require("../models/PriceCheck");
const Alert = require("../models/Alert");
const { runPriceCheck } = require("./priceChecker");
const { alertNotifier } = require("./alertNotifier");
const {
  CHECK_INTERVAL_MS,
  RETRY_INITIAL_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  MAX_CONSECUTIVE_FAILURES,
  LOCK_TTL_MS,
  DEFAULT_CONCURRENCY,
  PER_DOMAIN_DELAY_MS,
  SCHEDULER_TICK_CRON,
} = require("./constants");

let schedulerStarted = false;
let schedulerJob = null;
let schedulerRunning = false;
let lastTickStartedAt = null;
let lastTickCompletedAt = null;
let totalChecksCompleted = 0;

// In-memory rate limiting map: domain -> timestamp of last request
const domainLastRequestMap = new Map();

function buildDateFromNow(offsetMs) {
  return new Date(Date.now() + offsetMs);
}

function calculateRetryDelay(consecutiveFailures) {
  // Exponential backoff: 5m, 10m, 20m, 40m, capped at RETRY_MAX_DELAY_MS (60m)
  const multiplier = Math.pow(2, Math.max(0, consecutiveFailures - 1));
  const delayMs = RETRY_INITIAL_DELAY_MS * multiplier;
  return Math.min(delayMs, RETRY_MAX_DELAY_MS);
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}

/**
 * Ensure polite spacing between requests to the same domain
 */
async function enforceDomainRateLimit(domain) {
  const lastRequestTime = domainLastRequestMap.get(domain) || 0;
  const elapsed = Date.now() - lastRequestTime;

  if (elapsed < PER_DOMAIN_DELAY_MS) {
    const waitTime = PER_DOMAIN_DELAY_MS - elapsed + Math.floor(Math.random() * 200);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  domainLastRequestMap.set(domain, Date.now());
}

/**
 * Release any stale locks left by unexpected crashes
 */
async function releaseExpiredLocks() {
  const now = new Date();
  try {
    const result = await TrackedItem.updateMany(
      {
        checkInProgress: true,
        lockExpiresAt: { $lte: now },
      },
      {
        $set: {
          checkInProgress: false,
          lockExpiresAt: null,
        },
      },
    );
    if (result.modifiedCount > 0) {
      console.log(`[Scheduler] Released ${result.modifiedCount} expired lock(s).`);
    }
  } catch (error) {
    console.error("[Scheduler] Error releasing expired locks:", error.message);
  }
}

/**
 * Atomically claim next due active item
 */
async function claimDueTrackedItem() {
  const now = new Date();

  return TrackedItem.findOneAndUpdate(
    {
      active: true,
      nextCheckAt: { $lte: now },
      $or: [
        { checkInProgress: false },
        { lockExpiresAt: null },
        { lockExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        checkInProgress: true,
        lockExpiresAt: buildDateFromNow(LOCK_TTL_MS),
      },
    },
    {
      new: true,
      sort: { nextCheckAt: 1 },
    },
  ).populate("user");
}

/**
 * Generate alerts when target price or price drops occur
 */
async function createAlertIfNeeded(item, result) {
  if (result.status !== "success" || result.price == null || !item.user) {
    return;
  }

  const previousPrice = item.lastPrice;
  const currentPrice = result.price;
  const targetPrice = item.targetPrice;

  // Check target price condition
  if (targetPrice != null && currentPrice <= targetPrice) {
    const alert = await Alert.create({
      trackedItem: item._id,
      user: item.user._id,
      type: "target_price_reached",
      payload: {
        name: item.name,
        url: item.url,
        targetPrice,
        currentPrice,
        previousPrice,
        currency: result.currency || item.currency || "USD",
        checkedAt: new Date().toISOString(),
      },
    });

    await alertNotifier.dispatchNotification(alert, item, item.user);
    return;
  }

  // Check price drop condition (if previous price exists and was higher)
  if (previousPrice != null && currentPrice < previousPrice) {
    const alert = await Alert.create({
      trackedItem: item._id,
      user: item.user._id,
      type: "price_dropped",
      payload: {
        name: item.name,
        url: item.url,
        targetPrice,
        currentPrice,
        previousPrice,
        dropAmount: Math.round((previousPrice - currentPrice) * 100) / 100,
        currency: result.currency || item.currency || "USD",
        checkedAt: new Date().toISOString(),
      },
    });

    await alertNotifier.dispatchNotification(alert, item, item.user);
  }
}

/**
 * Execute price check for a claimed item and update scheduling intervals
 */
async function processClaimedItem(item) {
  const checkedAt = new Date();
  const domain = extractDomain(item.url);

  try {
    // Rate limit per domain
    await enforceDomainRateLimit(domain);

    const result = await runPriceCheck(item);

    await PriceCheck.create({
      trackedItem: item._id,
      checkedAt,
      status: result.status,
      price: result.price,
      currency: result.currency,
      responseMs: result.responseMs,
      errorMessage: result.errorMessage,
    });

    const isSuccess = result.status === "success";

    if (isSuccess) {
      // SUCCESS: schedule next check in exactly 1 hour (CHECK_INTERVAL_MS)
      await TrackedItem.updateOne(
        { _id: item._id },
        {
          $set: {
            lastCheckedAt: checkedAt,
            nextCheckAt: buildDateFromNow(CHECK_INTERVAL_MS),
            lastStatus: "success",
            checkInProgress: false,
            lockExpiresAt: null,
            consecutiveFailures: 0,
            failureReason: null,
            ...(result.price != null ? { lastPrice: result.price } : {}),
          },
        },
      );

      await createAlertIfNeeded(item, result);
    } else {
      // SKIPPED / PARSER ERROR: apply retry backoff
      const nextFailures = (item.consecutiveFailures || 0) + 1;
      const retryDelay = calculateRetryDelay(nextFailures);

      await TrackedItem.updateOne(
        { _id: item._id },
        {
          $set: {
            lastCheckedAt: checkedAt,
            nextCheckAt: buildDateFromNow(retryDelay),
            lastStatus: result.status === "skipped" ? "skipped" : "error",
            checkInProgress: false,
            lockExpiresAt: null,
            consecutiveFailures: nextFailures,
            failureReason: result.errorMessage,
          },
        },
      );
    }
  } catch (error) {
    const nextFailures = (item.consecutiveFailures || 0) + 1;
    const retryDelay = calculateRetryDelay(nextFailures);

    await TrackedItem.updateOne(
      { _id: item._id },
      {
        $set: {
          lastCheckedAt: checkedAt,
          nextCheckAt: buildDateFromNow(retryDelay),
          lastStatus: "error",
          checkInProgress: false,
          lockExpiresAt: null,
          consecutiveFailures: nextFailures,
          failureReason: error.message,
        },
      },
    );

    await PriceCheck.create({
      trackedItem: item._id,
      checkedAt,
      status: "error",
      price: null,
      currency: item.currency,
      responseMs: null,
      errorMessage: error.message,
    });
  } finally {
    totalChecksCompleted += 1;
  }
}

/**
 * Process due items concurrently using a worker pool
 */
async function processDueTrackedItems({ maxItems = null, concurrency = DEFAULT_CONCURRENCY } = {}) {
  if (schedulerRunning) {
    console.log("[Scheduler] Tick skipped: previous run is still active.");
    return { status: "skipped", reason: "already_running" };
  }

  schedulerRunning = true;
  lastTickStartedAt = new Date();
  let processedCount = 0;

  try {
    await releaseExpiredLocks();

    const activeWorkers = new Set();
    let keepClaiming = true;

    while (keepClaiming) {
      if (maxItems != null && processedCount >= maxItems) {
        break;
      }

      // If we have capacity in concurrency pool, claim next item
      if (activeWorkers.size < concurrency) {
        const item = await claimDueTrackedItem();

        if (item) {
          processedCount += 1;
          const taskPromise = processClaimedItem(item).finally(() => {
            activeWorkers.delete(taskPromise);
          });
          activeWorkers.add(taskPromise);
        } else {
          // No more due items ready right now
          keepClaiming = false;
        }
      } else {
        // Pool is full, wait for at least one worker to finish before claiming more
        await Promise.race(activeWorkers);
      }
    }

    // Wait for all remaining active workers in the pool to finish
    if (activeWorkers.size > 0) {
      await Promise.allSettled(Array.from(activeWorkers));
    }

    lastTickCompletedAt = new Date();
    if (processedCount > 0) {
      console.log(`[Scheduler] Tick completed: processed ${processedCount} item(s).`);
    }

    return {
      status: "completed",
      processedCount,
      startedAt: lastTickStartedAt,
      completedAt: lastTickCompletedAt,
    };
  } finally {
    schedulerRunning = false;
  }
}

/**
 * Start high-frequency scheduler job
 */
function startPriceScheduler() {
  const isEnabled = process.env.SCHEDULER_ENABLED !== "false";

  if (!isEnabled) {
    console.log("[Scheduler] Price scheduler is disabled via SCHEDULER_ENABLED=false.");
    return;
  }

  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;

  const cronPattern = process.env.SCHEDULER_CRON || SCHEDULER_TICK_CRON;

  // Run on cron schedule (ticks every minute by default to pick up due 1-hour items & retries)
  schedulerJob = cron.schedule(cronPattern, () => {
    processDueTrackedItems().catch((error) => {
      console.error("[Scheduler] Execution error:", error);
    });
  });

  // Run on startup if enabled
  const runOnStartup = process.env.SCHEDULER_RUN_ON_STARTUP !== "false";
  if (runOnStartup) {
    processDueTrackedItems().catch((error) => {
      console.error("[Scheduler] Startup run failed:", error);
    });
  }

  console.log(`[Scheduler] High-Frequency Price Scheduler active (cron: "${cronPattern}", 1-hour intervals per item).`);
}

/**
 * Stop price scheduler job
 */
function stopPriceScheduler() {
  if (schedulerJob) {
    schedulerJob.stop();
    schedulerJob = null;
  }
  schedulerStarted = false;
  console.log("[Scheduler] Price scheduler stopped.");
}

/**
 * Get current scheduler status and metrics
 */
async function getSchedulerStatus() {
  const now = new Date();
  const [totalActive, dueCount, pendingLockCount] = await Promise.all([
    TrackedItem.countDocuments({ active: true }),
    TrackedItem.countDocuments({ active: true, nextCheckAt: { $lte: now } }),
    TrackedItem.countDocuments({ active: true, checkInProgress: true }),
  ]);

  return {
    schedulerStarted,
    schedulerRunning,
    totalActiveItems: totalActive,
    dueItemsCount: dueCount,
    lockedItemsCount: pendingLockCount,
    lastTickStartedAt,
    lastTickCompletedAt,
    totalChecksCompleted,
    checkIntervalHours: CHECK_INTERVAL_MS / (60 * 60 * 1000),
  };
}

module.exports = {
  startPriceScheduler,
  stopPriceScheduler,
  processDueTrackedItems,
  claimDueTrackedItem,
  processClaimedItem,
  createAlertIfNeeded,
  releaseExpiredLocks,
  getSchedulerStatus,
  calculateRetryDelay,
};
