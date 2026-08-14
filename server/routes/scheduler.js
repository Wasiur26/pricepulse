const express = require("express");
const {
  processDueTrackedItems,
  getSchedulerStatus,
  releaseExpiredLocks,
} = require("../scheduler/priceScheduler");

const router = express.Router();

function requireSchedulerToken(req, res, next) {
  const configuredToken = process.env.SCHEDULER_ADMIN_TOKEN;

  if (!configuredToken) {
    return next();
  }

  const token = req.header("x-scheduler-token")?.trim();
  if (token !== configuredToken) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Invalid scheduler token.",
    });
  }

  return next();
}

/**
 * GET /api/scheduler/status
 * Returns current scheduler health, active jobs, due items, and run stats
 */
router.get("/status", requireSchedulerToken, async (req, res) => {
  try {
    const status = await getSchedulerStatus();
    return res.json({ status: "ok", scheduler: status });
  } catch (error) {
    return res.status(500).json({
      error: "ServerError",
      message: "Failed to retrieve scheduler status.",
    });
  }
});

/**
 * POST /api/scheduler/run-once
 * Triggers an immediate execution of due price-check queries
 */
router.post("/run-once", requireSchedulerToken, async (req, res) => {
  try {
    const maxItemsRaw = req.body?.maxItems;
    let maxItems = null;
    if (maxItemsRaw != null) {
      const parsed = Number.parseInt(String(maxItemsRaw), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        maxItems = Math.min(parsed, 5000);
      }
    }

    const concurrencyRaw = req.body?.concurrency;
    let concurrency = 5;
    if (concurrencyRaw != null) {
      const parsed = Number.parseInt(String(concurrencyRaw), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        concurrency = Math.min(parsed, 20);
      }
    }

    const result = await processDueTrackedItems({ maxItems, concurrency });

    return res.status(200).json({
      message: "Scheduler run complete.",
      result,
    });
  } catch (error) {
    return res.status(500).json({
      error: "ServerError",
      message: "Failed to run scheduler.",
      details: error.message,
    });
  }
});

/**
 * POST /api/scheduler/reset-locks
 * Releases any stuck or expired locks
 */
router.post("/reset-locks", requireSchedulerToken, async (req, res) => {
  try {
    await releaseExpiredLocks();
    return res.json({ message: "Expired locks released successfully." });
  } catch (error) {
    return res.status(500).json({
      error: "ServerError",
      message: "Failed to release locks.",
    });
  }
});

module.exports = {
  schedulerRouter: router,
};
