const mongoose = require("mongoose");
const TrackedItem = require("../models/TrackedItem");
const PriceCheck = require("../models/PriceCheck");
const { createAlertIfNeeded } = require("../scheduler/priceScheduler");

/**
 * Convert TrackedItem document to clean DTO
 */
function toTrackedItemDto(item) {
  if (!item) return null;
  return {
    id: item._id?.toString() || item.id,
    userId: item.user?.toString() || item.userId,
    name: item.name,
    url: item.url,
    image: item.image || null,
    platform: item.platform || null,
    targetPrice: item.targetPrice != null ? item.targetPrice : null,
    currency: item.currency || "USD",
    active: Boolean(item.active),
    lastPrice: item.lastPrice != null ? item.lastPrice : null,
    lastStatus: item.lastStatus || "pending",
    lastCheckedAt: item.lastCheckedAt ? new Date(item.lastCheckedAt).toISOString() : null,
    nextCheckAt: item.nextCheckAt ? new Date(item.nextCheckAt).toISOString() : null,
    consecutiveFailures: item.consecutiveFailures || 0,
    failureReason: item.failureReason || null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
  };
}

/**
 * Convert PriceCheck document to clean DTO
 */
function toPriceCheckDto(check) {
  if (!check) return null;
  return {
    id: check._id?.toString() || check.id,
    trackedItemId: check.trackedItem?.toString() || check.trackedItemId,
    checkedAt: check.checkedAt ? new Date(check.checkedAt).toISOString() : null,
    status: check.status,
    price: check.price != null ? check.price : null,
    currency: check.currency || "USD",
    responseMs: check.responseMs != null ? check.responseMs : null,
    errorMessage: check.errorMessage || null,
    createdAt: check.createdAt ? new Date(check.createdAt).toISOString() : null,
  };
}

/**
 * Parse timeframe string or custom date bounds into Date objects
 */
function parseTimeframe(timeframe = "all", customStart = null, customEnd = null) {
  const now = new Date();
  let startDate = null;
  let endDate = customEnd ? new Date(customEnd) : now;

  if (Number.isNaN(endDate.getTime())) {
    endDate = now;
  }

  if (customStart) {
    const parsedStart = new Date(customStart);
    if (!Number.isNaN(parsedStart.getTime())) {
      startDate = parsedStart;
      return { startDate, endDate, timeframe: "custom" };
    }
  }

  const normalized = String(timeframe).toLowerCase().trim();

  switch (normalized) {
    case "24h":
    case "1d":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
    case "1w":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
    case "1m":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
    case "3m":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "180d":
    case "6m":
      startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      break;
    case "1y":
    case "365d":
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case "all":
    default:
      startDate = null;
      break;
  }

  return { startDate, endDate, timeframe: normalized };
}

/**
 * Calculate statistical price metrics from price check arrays
 */
function calculatePriceStatistics(periodChecks = [], allTimeChecks = [], currentPrice = null, targetPrice = null) {
  const periodSuccessful = periodChecks.filter((c) => c.status === "success" && typeof c.price === "number" && !Number.isNaN(c.price));
  const allTimeSuccessful = allTimeChecks.filter((c) => c.status === "success" && typeof c.price === "number" && !Number.isNaN(c.price));

  const stats = {
    currentPrice: currentPrice != null ? currentPrice : (allTimeSuccessful[0]?.price ?? null),
    currency: allTimeChecks[0]?.currency || "USD",
    totalChecks: periodChecks.length,
    successfulChecks: periodSuccessful.length,
    failedChecks: periodChecks.filter((c) => c.status === "error").length,
    allTimeHigh: null,
    allTimeLow: null,
    allTimeAverage: null,
    periodHigh: null,
    periodLow: null,
    periodAverage: null,
    initialPrice: null,
    periodChange: null,
    allTimeChange: null,
    targetPriceDistance: null,
  };

  // Compute All-Time High / Low / Average / Initial
  if (allTimeSuccessful.length > 0) {
    let highest = allTimeSuccessful[0];
    let lowest = allTimeSuccessful[0];
    let sum = 0;

    for (const c of allTimeSuccessful) {
      sum += c.price;
      if (c.price > highest.price) highest = c;
      if (c.price < lowest.price) lowest = c;
    }

    const oldest = allTimeSuccessful[allTimeSuccessful.length - 1];

    stats.allTimeHigh = {
      price: highest.price,
      checkedAt: highest.checkedAt ? new Date(highest.checkedAt).toISOString() : null,
    };
    stats.allTimeLow = {
      price: lowest.price,
      checkedAt: lowest.checkedAt ? new Date(lowest.checkedAt).toISOString() : null,
    };
    stats.allTimeAverage = Math.round((sum / allTimeSuccessful.length) * 100) / 100;
    stats.initialPrice = oldest?.price ?? null;

    if (stats.currentPrice != null && stats.initialPrice != null && stats.initialPrice > 0) {
      const diff = stats.currentPrice - stats.initialPrice;
      stats.allTimeChange = {
        amount: Math.round(diff * 100) / 100,
        percentage: Math.round((diff / stats.initialPrice) * 10000) / 100,
      };
    }
  }

  // Compute Period High / Low / Average / Change
  if (periodSuccessful.length > 0) {
    let highest = periodSuccessful[0];
    let lowest = periodSuccessful[0];
    let sum = 0;

    for (const c of periodSuccessful) {
      sum += c.price;
      if (c.price > highest.price) highest = c;
      if (c.price < lowest.price) lowest = c;
    }

    const oldestInPeriod = periodSuccessful[periodSuccessful.length - 1];
    const newestInPeriod = periodSuccessful[0];

    stats.periodHigh = {
      price: highest.price,
      checkedAt: highest.checkedAt ? new Date(highest.checkedAt).toISOString() : null,
    };
    stats.periodLow = {
      price: lowest.price,
      checkedAt: lowest.checkedAt ? new Date(lowest.checkedAt).toISOString() : null,
    };
    stats.periodAverage = Math.round((sum / periodSuccessful.length) * 100) / 100;

    if (newestInPeriod && oldestInPeriod && oldestInPeriod.price > 0) {
      const diff = newestInPeriod.price - oldestInPeriod.price;
      stats.periodChange = {
        amount: Math.round(diff * 100) / 100,
        percentage: Math.round((diff / oldestInPeriod.price) * 10000) / 100,
      };
    }
  }

  // Compute Target Price Metrics
  if (targetPrice != null && stats.currentPrice != null) {
    const diff = stats.currentPrice - targetPrice;
    stats.targetPriceDistance = {
      targetPrice,
      currentPrice: stats.currentPrice,
      amountNeeded: Math.max(0, Math.round(diff * 100) / 100),
      percentageNeeded: diff > 0 ? Math.round((diff / stats.currentPrice) * 10000) / 100 : 0,
      isTargetReached: stats.currentPrice <= targetPrice,
    };
  }

  return stats;
}

/**
 * Determine default charting interval based on timeframe
 */
function resolveChartInterval(timeframe = "all", requestedInterval = null) {
  if (requestedInterval && ["raw", "hourly", "daily", "weekly", "monthly"].includes(requestedInterval)) {
    return requestedInterval;
  }

  switch (timeframe) {
    case "24h":
      return "hourly";
    case "7d":
      return "hourly";
    case "30d":
    case "90d":
      return "daily";
    case "180d":
    case "1y":
      return "weekly";
    case "all":
    default:
      return "daily";
  }
}

/**
 * Downsample and bucket price checks into OHLC / Average intervals
 */
function bucketPriceChecks(checks = [], interval = "daily") {
  const valid = checks
    .filter((c) => c.status === "success" && typeof c.price === "number" && !Number.isNaN(c.price))
    .sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime());

  if (valid.length === 0) {
    return [];
  }

  if (interval === "raw") {
    return valid.map((c) => ({
      timestamp: new Date(c.checkedAt).toISOString(),
      price: c.price,
      open: c.price,
      high: c.price,
      low: c.price,
      close: c.price,
      count: 1,
    }));
  }

  const buckets = new Map();

  for (const check of valid) {
    const date = new Date(check.checkedAt);
    let key;

    switch (interval) {
      case "hourly": {
        const d = new Date(date);
        d.setMinutes(0, 0, 0);
        key = d.toISOString();
        break;
      }
      case "weekly": {
        const d = new Date(date);
        const day = d.getUTCDay();
        const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
        d.setUTCDate(diff);
        d.setUTCHours(0, 0, 0, 0);
        key = d.toISOString();
        break;
      }
      case "monthly": {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
        key = d.toISOString();
        break;
      }
      case "daily":
      default: {
        const d = new Date(date);
        d.setUTCHours(0, 0, 0, 0);
        key = d.toISOString();
        break;
      }
    }

    if (!buckets.has(key)) {
      buckets.set(key, {
        timestamp: key,
        prices: [],
      });
    }

    buckets.get(key).prices.push(check.price);
  }

  const points = [];

  for (const [key, bucket] of buckets.entries()) {
    const prices = bucket.prices;
    const open = prices[0];
    const close = prices[prices.length - 1];
    let high = prices[0];
    let low = prices[0];
    let sum = 0;

    for (const p of prices) {
      sum += p;
      if (p > high) high = p;
      if (p < low) low = p;
    }

    const avg = Math.round((sum / prices.length) * 100) / 100;

    points.push({
      timestamp: key,
      price: avg,
      open,
      high,
      low,
      close,
      count: prices.length,
    });
  }

  return points;
}

/**
 * Generate CSV string from price check records
 */
function formatPriceHistoryCsv(item, checks = []) {
  const escapeCsv = (str) => {
    if (str == null) return "";
    const s = String(str);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    `# PricePulse History Export: ${escapeCsv(item.name)}`,
    `# Product URL: ${escapeCsv(item.url)}`,
    `# Exported At: ${new Date().toISOString()}`,
    `# Currency: ${escapeCsv(item.currency || "USD")}`,
    "",
    "Check ID,Checked At (UTC),Status,Price,Currency,Response Time (ms),Error Message",
  ];

  for (const c of checks) {
    lines.push(
      [
        escapeCsv(c._id || c.id),
        escapeCsv(c.checkedAt ? new Date(c.checkedAt).toISOString() : ""),
        escapeCsv(c.status),
        c.price != null ? c.price.toFixed(2) : "",
        escapeCsv(c.currency || item.currency || "USD"),
        c.responseMs != null ? c.responseMs : "",
        escapeCsv(c.errorMessage || ""),
      ].join(","),
    );
  }

  return lines.join("\r\n");
}

class PriceHistoryService {
  /**
   * Helper: verify item ownership and return item
   */
  async getVerifiedTrackedItem(trackedItemId, userId) {
    if (!mongoose.Types.ObjectId.isValid(trackedItemId)) {
      const err = new Error("Invalid tracked item id.");
      err.statusCode = 400;
      err.code = "ValidationError";
      throw err;
    }

    const item = await TrackedItem.findOne({
      _id: trackedItemId,
      user: userId,
    }).lean();

    if (!item) {
      const err = new Error("Tracked item not found.");
      err.statusCode = 404;
      err.code = "NotFound";
      throw err;
    }

    return item;
  }

  /**
   * Comprehensive Price History Query with filtering, statistics, and pagination
   */
  async getPriceHistory(trackedItemId, userId, options = {}) {
    const item = await this.getVerifiedTrackedItem(trackedItemId, userId);

    const {
      timeframe = "all",
      startDate: customStart,
      endDate: customEnd,
      status = "all",
      sort = "desc",
      page = 1,
      limit = 50,
    } = options;

    const { startDate, endDate, timeframe: resolvedTimeframe } = parseTimeframe(
      timeframe,
      customStart,
      customEnd,
    );

    const filter = { trackedItem: item._id };

    if (startDate || endDate) {
      filter.checkedAt = {};
      if (startDate) filter.checkedAt.$gte = startDate;
      if (endDate) filter.checkedAt.$lte = endDate;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    const parsedPage = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const parsedLimit = Math.min(500, Math.max(1, Number.parseInt(String(limit), 10) || 50));
    const skip = (parsedPage - 1) * parsedLimit;
    const sortOrder = sort === "asc" ? 1 : -1;

    // Run parallel queries: paginated results, total count, and all-time checks for summary stats
    const [paginatedChecks, totalRecords, allTimeChecks, periodChecksForStats] = await Promise.all([
      PriceCheck.find(filter)
        .sort({ checkedAt: sortOrder })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      PriceCheck.countDocuments(filter),
      PriceCheck.find({ trackedItem: item._id, status: "success" })
        .sort({ checkedAt: -1 })
        .lean(),
      PriceCheck.find(filter)
        .sort({ checkedAt: -1 })
        .limit(2000)
        .lean(),
    ]);

    const summary = calculatePriceStatistics(
      periodChecksForStats,
      allTimeChecks,
      item.lastPrice,
      item.targetPrice,
    );

    const totalPages = Math.ceil(totalRecords / parsedLimit) || 1;

    return {
      item: toTrackedItemDto(item),
      timeframe: resolvedTimeframe,
      summary,
      history: paginatedChecks.map(toPriceCheckDto),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalRecords,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPrevPage: parsedPage > 1,
      },
    };
  }

  /**
   * Resampled time-series data for interactive charts
   */
  async getChartData(trackedItemId, userId, options = {}) {
    const item = await this.getVerifiedTrackedItem(trackedItemId, userId);

    const {
      timeframe = "30d",
      startDate: customStart,
      endDate: customEnd,
      interval: requestedInterval,
    } = options;

    const { startDate, endDate, timeframe: resolvedTimeframe } = parseTimeframe(
      timeframe,
      customStart,
      customEnd,
    );

    const interval = resolveChartInterval(resolvedTimeframe, requestedInterval);

    const filter = {
      trackedItem: item._id,
      status: "success",
    };

    if (startDate || endDate) {
      filter.checkedAt = {};
      if (startDate) filter.checkedAt.$gte = startDate;
      if (endDate) filter.checkedAt.$lte = endDate;
    }

    const rawChecks = await PriceCheck.find(filter)
      .sort({ checkedAt: 1 })
      .lean();

    const points = bucketPriceChecks(rawChecks, interval);

    // Compute period summary for chart header
    let chartSummary = null;
    if (points.length > 0) {
      let high = points[0].high;
      let low = points[0].low;
      let sum = 0;
      let totalCount = 0;

      for (const pt of points) {
        if (pt.high > high) high = pt.high;
        if (pt.low < low) low = pt.low;
        sum += pt.price * pt.count;
        totalCount += pt.count;
      }

      const openPrice = points[0].open;
      const closePrice = points[points.length - 1].close;
      const changeAmount = Math.round((closePrice - openPrice) * 100) / 100;
      const changePercent = openPrice > 0 ? Math.round((changeAmount / openPrice) * 10000) / 100 : 0;

      chartSummary = {
        high,
        low,
        average: totalCount > 0 ? Math.round((sum / totalCount) * 100) / 100 : null,
        openPrice,
        closePrice,
        changeAmount,
        changePercent,
        pointsCount: points.length,
        rawChecksCount: rawChecks.length,
      };
    }

    return {
      item: toTrackedItemDto(item),
      timeframe: resolvedTimeframe,
      interval,
      summary: chartSummary,
      points,
    };
  }

  /**
   * Deep analytics, multi-period breakdown, and deal evaluation
   */
  async getHistoryAnalytics(trackedItemId, userId) {
    const item = await this.getVerifiedTrackedItem(trackedItemId, userId);

    const allSuccessChecks = await PriceCheck.find({
      trackedItem: item._id,
      status: "success",
    })
      .sort({ checkedAt: 1 })
      .lean();

    if (allSuccessChecks.length === 0) {
      return {
        item: toTrackedItemDto(item),
        hasData: false,
        message: "No successful price checks recorded yet.",
        currentPrice: item.lastPrice,
        targetPrice: item.targetPrice,
      };
    }

    const now = new Date();
    const prices = allSuccessChecks.map((c) => c.price);
    const currentPrice = item.lastPrice != null ? item.lastPrice : prices[prices.length - 1];
    const initialPrice = prices[0];

    // All time stats
    let allTimeHigh = allSuccessChecks[0];
    let allTimeLow = allSuccessChecks[0];
    let sum = 0;

    for (const c of allSuccessChecks) {
      sum += c.price;
      if (c.price > allTimeHigh.price) allTimeHigh = c;
      if (c.price < allTimeLow.price) allTimeLow = c;
    }

    const averagePrice = Math.round((sum / allSuccessChecks.length) * 100) / 100;

    // Median price
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sortedPrices.length / 2);
    const medianPrice =
      sortedPrices.length % 2 !== 0
        ? sortedPrices[mid]
        : Math.round(((sortedPrices[mid - 1] + sortedPrices[mid]) / 2) * 100) / 100;

    // Standard deviation (volatility)
    const variance =
      prices.reduce((acc, p) => acc + Math.pow(p - averagePrice, 2), 0) / prices.length;
    const stdDev = Math.round(Math.sqrt(variance) * 100) / 100;
    const volatilityPercent = averagePrice > 0 ? Math.round((stdDev / averagePrice) * 10000) / 100 : 0;

    // Periods breakdown helper
    const computePeriodStats = (days) => {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const periodChecks = allSuccessChecks.filter((c) => new Date(c.checkedAt) >= cutoff);
      if (periodChecks.length === 0) return null;

      let high = periodChecks[0].price;
      let low = periodChecks[0].price;
      let pSum = 0;

      for (const c of periodChecks) {
        pSum += c.price;
        if (c.price > high) high = c.price;
        if (c.price < low) low = c.price;
      }

      const start = periodChecks[0].price;
      const end = periodChecks[periodChecks.length - 1].price;
      const delta = Math.round((end - start) * 100) / 100;
      const deltaPercent = start > 0 ? Math.round((delta / start) * 10000) / 100 : 0;

      return {
        high,
        low,
        average: Math.round((pSum / periodChecks.length) * 100) / 100,
        changeAmount: delta,
        changePercent: deltaPercent,
        checksCount: periodChecks.length,
      };
    };

    const periods = {
      last24h: computePeriodStats(1),
      last7d: computePeriodStats(7),
      last30d: computePeriodStats(30),
      last90d: computePeriodStats(90),
      last1y: computePeriodStats(365),
    };

    // Deal evaluation & score
    const discountFromHigh =
      allTimeHigh.price > 0
        ? Math.round(((allTimeHigh.price - currentPrice) / allTimeHigh.price) * 10000) / 100
        : 0;

    const premiumOverLow =
      allTimeLow.price > 0
        ? Math.round(((currentPrice - allTimeLow.price) / allTimeLow.price) * 10000) / 100
        : 0;

    let dealRating = "AVERAGE";
    let dealScore = 50; // scale 0-100

    if (currentPrice <= allTimeLow.price) {
      dealRating = "ALL_TIME_LOW";
      dealScore = 100;
    } else if (item.targetPrice != null && currentPrice <= item.targetPrice) {
      dealRating = "TARGET_REACHED";
      dealScore = 95;
    } else if (discountFromHigh >= 20 || premiumOverLow <= 5) {
      dealRating = "GREAT_DEAL";
      dealScore = 85;
    } else if (discountFromHigh >= 10 || premiumOverLow <= 15) {
      dealRating = "GOOD_DEAL";
      dealScore = 70;
    } else if (currentPrice >= allTimeHigh.price) {
      dealRating = "ALL_TIME_HIGH";
      dealScore = 15;
    } else if (premiumOverLow > 30) {
      dealRating = "EXPENSIVE";
      dealScore = 30;
    }

    // Price change trend
    const recent30 = periods.last30d || periods.last7d;
    let trend = "STABLE";
    if (recent30) {
      if (recent30.changePercent <= -2) trend = "FALLING";
      else if (recent30.changePercent >= 2) trend = "RISING";
    }

    return {
      item: toTrackedItemDto(item),
      hasData: true,
      metrics: {
        currentPrice,
        initialPrice,
        currency: item.currency || "USD",
        allTimeHigh: {
          price: allTimeHigh.price,
          checkedAt: new Date(allTimeHigh.checkedAt).toISOString(),
        },
        allTimeLow: {
          price: allTimeLow.price,
          checkedAt: new Date(allTimeLow.checkedAt).toISOString(),
        },
        averagePrice,
        medianPrice,
        volatility: {
          stdDev,
          volatilityPercent,
          rating: volatilityPercent < 5 ? "LOW" : volatilityPercent < 15 ? "MEDIUM" : "HIGH",
        },
        discountFromHigh: {
          amount: Math.round((allTimeHigh.price - currentPrice) * 100) / 100,
          percentage: discountFromHigh,
        },
        premiumOverLow: {
          amount: Math.round((currentPrice - allTimeLow.price) * 100) / 100,
          percentage: premiumOverLow,
        },
        targetPrice: item.targetPrice != null ? {
          price: item.targetPrice,
          distanceAmount: Math.max(0, Math.round((currentPrice - item.targetPrice) * 100) / 100),
          distancePercent: currentPrice > item.targetPrice ? Math.round(((currentPrice - item.targetPrice) / currentPrice) * 10000) / 100 : 0,
          isReached: currentPrice <= item.targetPrice,
        } : null,
      },
      dealEvaluation: {
        rating: dealRating,
        score: dealScore,
        trend,
      },
      periods,
    };
  }

  /**
   * Multi-item overview with 7-day sparklines for user dashboard
   */
  async getOverviewSummary(userId, options = {}) {
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(options.limit || "50"), 10) || 50));

    const items = await TrackedItem.find({ user: userId, active: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (items.length === 0) {
      return { items: [], totalTracked: 0 };
    }

    const itemIds = items.map((i) => i._id);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const checks = await PriceCheck.find({
      trackedItem: { $in: itemIds },
      status: "success",
      checkedAt: { $gte: sevenDaysAgo },
    })
      .sort({ checkedAt: 1 })
      .lean();

    const checksByItem = new Map();
    for (const c of checks) {
      const k = c.trackedItem.toString();
      if (!checksByItem.has(k)) checksByItem.set(k, []);
      checksByItem.get(k).push(c);
    }

    const overviewItems = items.map((item) => {
      const itemChecks = checksByItem.get(item._id.toString()) || [];
      const sparkline = itemChecks.map((c) => ({
        timestamp: new Date(c.checkedAt).toISOString(),
        price: c.price,
      }));

      let change7d = null;
      if (itemChecks.length >= 2) {
        const start = itemChecks[0].price;
        const end = itemChecks[itemChecks.length - 1].price;
        const diff = Math.round((end - start) * 100) / 100;
        change7d = {
          amount: diff,
          percentage: start > 0 ? Math.round((diff / start) * 10000) / 100 : 0,
        };
      }

      return {
        item: toTrackedItemDto(item),
        currentPrice: item.lastPrice,
        currency: item.currency || "USD",
        targetPrice: item.targetPrice,
        isTargetReached: item.targetPrice != null && item.lastPrice != null && item.lastPrice <= item.targetPrice,
        change7d,
        sparkline,
        recentChecksCount: itemChecks.length,
      };
    });

    return {
      items: overviewItems,
      totalTracked: items.length,
    };
  }

  /**
   * Manually log / record a price check entry
   */
  async logPriceCheck(trackedItemId, userId, checkData = {}) {
    const item = await this.getVerifiedTrackedItem(trackedItemId, userId);

    const rawPrice = checkData.price;
    const status = ["success", "error", "skipped"].includes(checkData.status)
      ? checkData.status
      : "success";

    let price = null;
    if (status === "success") {
      if (rawPrice === null || rawPrice === undefined || rawPrice === "") {
        const err = new Error("Price is required for successful price checks.");
        err.statusCode = 400;
        err.code = "ValidationError";
        throw err;
      }
      price = Number(rawPrice);
      if (!Number.isFinite(price) || price < 0) {
        const err = new Error("Price must be a non-negative number.");
        err.statusCode = 400;
        err.code = "ValidationError";
        throw err;
      }
    }

    const currency = checkData.currency ? String(checkData.currency).trim().toUpperCase().slice(0, 10) : item.currency || "USD";
    const checkedAt = checkData.checkedAt ? new Date(checkData.checkedAt) : new Date();
    const responseMs = Number.isFinite(Number(checkData.responseMs)) && Number(checkData.responseMs) >= 0 ? Number(checkData.responseMs) : null;
    const errorMessage = checkData.errorMessage ? String(checkData.errorMessage).slice(0, 500) : null;

    const check = await PriceCheck.create({
      trackedItem: item._id,
      checkedAt,
      status,
      price,
      currency,
      responseMs,
      errorMessage,
    });

    // Update item lastPrice & lastCheckedAt if this check is newer or item has no check
    const isNewer = !item.lastCheckedAt || checkedAt >= new Date(item.lastCheckedAt);
    let updatedItem = item;

    if (isNewer) {
      const updateFields = {
        lastCheckedAt: checkedAt,
        lastStatus: status,
      };
      if (status === "success" && price != null) {
        updateFields.lastPrice = price;
        updateFields.consecutiveFailures = 0;
        updateFields.failureReason = null;
      } else if (status === "error") {
        updateFields.consecutiveFailures = (item.consecutiveFailures || 0) + 1;
        updateFields.failureReason = errorMessage;
      }

      updatedItem = await TrackedItem.findByIdAndUpdate(
        item._id,
        { $set: updateFields },
        { returnDocument: "after" },
      ).lean();

      // Trigger alert evaluation if needed
      if (status === "success" && price != null) {
        await createAlertIfNeeded(item, {
          status: "success",
          price,
          currency,
          responseMs,
        });
      }
    }

    return {
      check: toPriceCheckDto(check),
      item: toTrackedItemDto(updatedItem),
    };
  }

  /**
   * Export price history as CSV or JSON
   */
  async exportPriceHistory(trackedItemId, userId, options = {}) {
    const item = await this.getVerifiedTrackedItem(trackedItemId, userId);

    const {
      format = "json",
      timeframe = "all",
      startDate: customStart,
      endDate: customEnd,
      status = "all",
    } = options;

    const { startDate, endDate } = parseTimeframe(timeframe, customStart, customEnd);

    const filter = { trackedItem: item._id };
    if (startDate || endDate) {
      filter.checkedAt = {};
      if (startDate) filter.checkedAt.$gte = startDate;
      if (endDate) filter.checkedAt.$lte = endDate;
    }
    if (status && status !== "all") {
      filter.status = status;
    }

    const checks = await PriceCheck.find(filter)
      .sort({ checkedAt: 1 })
      .lean();

    if (format.toLowerCase() === "csv") {
      const csv = formatPriceHistoryCsv(item, checks);
      const filename = `price-history-${item.name.replace(/[^a-z0-9_-]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
      return {
        format: "csv",
        contentType: "text/csv; charset=utf-8",
        filename,
        data: csv,
      };
    }

    const filename = `price-history-${item.name.replace(/[^a-z0-9_-]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
    return {
      format: "json",
      contentType: "application/json; charset=utf-8",
      filename,
      data: {
        item: toTrackedItemDto(item),
        exportedAt: new Date().toISOString(),
        totalRecords: checks.length,
        history: checks.map(toPriceCheckDto),
      },
    };
  }

  /**
   * Delete a specific price check entry and recalibrate item lastPrice if needed
   */
  async deletePriceCheck(trackedItemId, userId, checkId) {
    const item = await this.getVerifiedTrackedItem(trackedItemId, userId);

    if (!mongoose.Types.ObjectId.isValid(checkId)) {
      const err = new Error("Invalid price check id.");
      err.statusCode = 400;
      err.code = "ValidationError";
      throw err;
    }

    const check = await PriceCheck.findOneAndDelete({
      _id: checkId,
      trackedItem: item._id,
    });

    if (!check) {
      const err = new Error("Price check not found.");
      err.statusCode = 404;
      err.code = "NotFound";
      throw err;
    }

    // Recalibrate last price and status if deleted check was the latest
    const latestCheck = await PriceCheck.findOne({ trackedItem: item._id })
      .sort({ checkedAt: -1 })
      .lean();

    let updatedItem = item;
    if (latestCheck) {
      updatedItem = await TrackedItem.findByIdAndUpdate(
        item._id,
        {
          $set: {
            lastCheckedAt: latestCheck.checkedAt,
            lastStatus: latestCheck.status,
            ...(latestCheck.price != null ? { lastPrice: latestCheck.price } : {}),
          },
        },
        { returnDocument: "after" },
      ).lean();
    } else {
      updatedItem = await TrackedItem.findByIdAndUpdate(
        item._id,
        {
          $set: {
            lastCheckedAt: null,
            lastStatus: "pending",
            lastPrice: null,
          },
        },
        { returnDocument: "after" },
      ).lean();
    }

    return {
      deletedCheckId: checkId,
      item: toTrackedItemDto(updatedItem),
    };
  }

  /**
   * Prune price history older than a given date or duration
   */
  async prunePriceHistory(trackedItemId, userId, options = {}) {
    const item = await this.getVerifiedTrackedItem(trackedItemId, userId);

    const { olderThan } = options;
    let cutoffDate = null;

    if (olderThan) {
      if (typeof olderThan === "string" && olderThan.endsWith("d")) {
        const days = Number.parseInt(olderThan.slice(0, -1), 10);
        if (Number.isFinite(days) && days > 0) {
          cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        }
      } else {
        const parsed = new Date(olderThan);
        if (!Number.isNaN(parsed.getTime())) {
          cutoffDate = parsed;
        }
      }
    }

    const filter = { trackedItem: item._id };
    if (cutoffDate) {
      filter.checkedAt = { $lt: cutoffDate };
    }

    const deleteResult = await PriceCheck.deleteMany(filter);

    return {
      deletedCount: deleteResult.deletedCount,
      olderThan: cutoffDate ? cutoffDate.toISOString() : "all",
    };
  }
}

const priceHistoryService = new PriceHistoryService();

module.exports = {
  priceHistoryService,
  PriceHistoryService,
  toTrackedItemDto,
  toPriceCheckDto,
  parseTimeframe,
  calculatePriceStatistics,
  bucketPriceChecks,
  formatPriceHistoryCsv,
};
