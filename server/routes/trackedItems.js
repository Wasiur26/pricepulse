const express = require("express");
const mongoose = require("mongoose");
const TrackedItem = require("../models/TrackedItem");
const PriceCheck = require("../models/PriceCheck");
const Alert = require("../models/Alert");
const { fetchProductMetadata } = require("../scheduler/productScraper");
const { priceHistoryService } = require("../services/priceHistoryService");

const router = express.Router();

function sanitizeTargetPrice(input) {
  if (input === null || input === undefined || input === "") return null;
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function sanitizeCurrency(input) {
  if (!input) return "USD";
  return String(input).trim().toUpperCase().slice(0, 10) || "USD";
}

function toTrackedItemDto(item) {
  return {
    id: item._id,
    userId: item.user,
    name: item.name,
    url: item.url,
    image: item.image,
    platform: item.platform,
    targetPrice: item.targetPrice,
    currency: item.currency,
    active: item.active,
    lastPrice: item.lastPrice,
    lastStatus: item.lastStatus,
    lastCheckedAt: item.lastCheckedAt,
    nextCheckAt: item.nextCheckAt,
    consecutiveFailures: item.consecutiveFailures || 0,
    failureReason: item.failureReason || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const items = await TrackedItem.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ items: items.map(toTrackedItemDto) });
  } catch (error) {
    return res.status(500).json({
      error: "ServerError",
      message: "Failed to fetch tracked items.",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const url = String(req.body?.url || "").trim();
    const targetPrice = sanitizeTargetPrice(req.body?.targetPrice);
    const currency = sanitizeCurrency(req.body?.currency);
    const image = req.body?.image ? String(req.body.image).trim() : null;
    const platform = req.body?.platform ? String(req.body.platform).trim().toLowerCase().slice(0, 64) : null;
    const initialPrice = sanitizeTargetPrice(req.body?.initialPrice);

    if (!url) {
      return res.status(400).json({
        error: "ValidationError",
        message: "url is required.",
      });
    }

    const item = await TrackedItem.create({
      user: req.user._id,
      name: name || url,
      url,
      image,
      platform,
      targetPrice,
      currency,
      active: true,
      nextCheckAt: new Date(),
      lastStatus: initialPrice != null ? "success" : "pending",
      ...(initialPrice != null ? { lastPrice: initialPrice } : {}),
    });

    return res.status(201).json({ item: toTrackedItemDto(item) });
  } catch (error) {
    return res.status(500).json({
      error: "ServerError",
      message: "Failed to create tracked item.",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const itemId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Invalid tracked item id.",
      });
    }

    const item = await TrackedItem.findOne({
      _id: itemId,
      user: req.user._id,
    }).lean();

    if (!item) {
      return res.status(404).json({
        error: "NotFound",
        message: "Tracked item not found.",
      });
    }

    return res.json({ item: toTrackedItemDto(item) });
  } catch (error) {
    return res.status(500).json({
      error: "ServerError",
      message: "Failed to fetch tracked item.",
    });
  }
});

/**
 * POST /extract
 * Clean a pasted product link, identify the platform, and return the initial
 * product metadata (name, image, current price) before saving to the database.
 */
router.post("/extract", async (req, res) => {
  try {
    const rawUrl = String(req.body?.url || "").trim();
    if (!rawUrl) {
      return res.status(400).json({
        error: "ValidationError",
        message: "url is required.",
      });
    }

    const metadata = await fetchProductMetadata(rawUrl);
    return res.json({ metadata });
  } catch (error) {
    if (error.code === "INVALID_URL") {
      return res.status(400).json({
        error: "ValidationError",
        message: error.message,
      });
    }
    if (error.code === "HTTP_ERROR") {
      return res.status(502).json({
        error: "FetchError",
        message: error.message,
      });
    }
    return res.status(500).json({
      error: "ServerError",
      message: error.message || "Failed to extract product metadata.",
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const itemId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Invalid tracked item id.",
      });
    }

    const updates = {};

    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      const nextName = String(req.body.name || "").trim();
      if (!nextName) {
        return res.status(400).json({
          error: "ValidationError",
          message: "name cannot be empty.",
        });
      }
      updates.name = nextName;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "url")) {
      const nextUrl = String(req.body.url || "").trim();
      if (!nextUrl) {
        return res.status(400).json({
          error: "ValidationError",
          message: "url cannot be empty.",
        });
      }
      updates.url = nextUrl;
      updates.nextCheckAt = new Date();
      updates.lastStatus = "pending";
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "targetPrice")) {
      const parsed = sanitizeTargetPrice(req.body.targetPrice);
      if (
        req.body.targetPrice !== null &&
        req.body.targetPrice !== "" &&
        parsed == null
      ) {
        return res.status(400).json({
          error: "ValidationError",
          message: "targetPrice must be a non-negative number or null.",
        });
      }
      updates.targetPrice = parsed;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "currency")) {
      updates.currency = sanitizeCurrency(req.body.currency);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "active")) {
      updates.active = Boolean(req.body.active);
      if (updates.active) {
        updates.nextCheckAt = new Date();
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "ValidationError",
        message: "No supported fields to update.",
      });
    }

    const item = await TrackedItem.findOneAndUpdate(
      { _id: itemId, user: req.user._id },
      { $set: updates },
      { returnDocument: "after" },
    );

    if (!item) {
      return res.status(404).json({
        error: "NotFound",
        message: "Tracked item not found.",
      });
    }

    return res.json({ item: toTrackedItemDto(item) });
  } catch (error) {
    return res.status(500).json({
      error: "ServerError",
      message: "Failed to update tracked item.",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const itemId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Invalid tracked item id.",
      });
    }

    const item = await TrackedItem.findOneAndDelete({
      _id: itemId,
      user: req.user._id,
    });

    if (!item) {
      return res.status(404).json({
        error: "NotFound",
        message: "Tracked item not found.",
      });
    }

    await Promise.all([
      PriceCheck.deleteMany({ trackedItem: item._id }),
      Alert.deleteMany({ trackedItem: item._id }),
    ]);

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({
      error: "ServerError",
      message: "Failed to delete tracked item.",
    });
  }
});

/**
 * GET /api/tracked-items/history/summary
 * Overview of price trends across all user items
 */
router.get("/history/summary", async (req, res) => {
  try {
    const data = await priceHistoryService.getOverviewSummary(req.user._id, {
      limit: req.query.limit,
    });
    return res.json(data);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      error: error.code || "ServerError",
      message: error.message || "Failed to retrieve history summary.",
    });
  }
});

/**
 * GET /api/tracked-items/:id/history
 * Comprehensive price history with statistics, filtering, and pagination
 */
router.get("/:id/history", async (req, res) => {
  try {
    const data = await priceHistoryService.getPriceHistory(
      req.params.id,
      req.user._id,
      {
        timeframe: req.query.timeframe,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        status: req.query.status,
        sort: req.query.sort,
        page: req.query.page,
        limit: req.query.limit,
      },
    );
    return res.json(data);
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "CastError" ? 400 : 500);
    return res.status(statusCode).json({
      error: error.code || "ServerError",
      message: error.message || "Failed to fetch price history.",
    });
  }
});

/**
 * GET /api/tracked-items/:id/history/chart
 * Bucketed time-series data for trend visualization
 */
router.get("/:id/history/chart", async (req, res) => {
  try {
    const data = await priceHistoryService.getChartData(
      req.params.id,
      req.user._id,
      {
        timeframe: req.query.timeframe,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        interval: req.query.interval,
      },
    );
    return res.json(data);
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "CastError" ? 400 : 500);
    return res.status(statusCode).json({
      error: error.code || "ServerError",
      message: error.message || "Failed to fetch chart data.",
    });
  }
});

/**
 * GET /api/tracked-items/:id/history/analytics
 * Comprehensive price statistics and deal analytics
 */
router.get("/:id/history/analytics", async (req, res) => {
  try {
    const data = await priceHistoryService.getHistoryAnalytics(
      req.params.id,
      req.user._id,
    );
    return res.json(data);
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "CastError" ? 400 : 500);
    return res.status(statusCode).json({
      error: error.code || "ServerError",
      message: error.message || "Failed to fetch price analytics.",
    });
  }
});

/**
 * GET /api/tracked-items/:id/history/export
 * Download price history as CSV or JSON
 */
router.get("/:id/history/export", async (req, res) => {
  try {
    const exportResult = await priceHistoryService.exportPriceHistory(
      req.params.id,
      req.user._id,
      {
        format: req.query.format,
        timeframe: req.query.timeframe,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        status: req.query.status,
      },
    );

    res.setHeader("Content-Type", exportResult.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${exportResult.filename}"`,
    );

    if (exportResult.format === "csv") {
      return res.send(exportResult.data);
    }
    return res.json(exportResult.data);
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "CastError" ? 400 : 500);
    return res.status(statusCode).json({
      error: error.code || "ServerError",
      message: error.message || "Failed to export price history.",
    });
  }
});

/**
 * POST /api/tracked-items/:id/history
 * Manually log/record a price check point
 */
router.post("/:id/history", async (req, res) => {
  try {
    const result = await priceHistoryService.logPriceCheck(
      req.params.id,
      req.user._id,
      req.body || {},
    );
    return res.status(201).json({
      message: "Price check logged successfully.",
      ...result,
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "CastError" ? 400 : 500);
    return res.status(statusCode).json({
      error: error.code || "ServerError",
      message: error.message || "Failed to log price check.",
    });
  }
});

/**
 * DELETE /api/tracked-items/:id/history/:checkId
 * Delete a specific price check entry
 */
router.delete("/:id/history/:checkId", async (req, res) => {
  try {
    const result = await priceHistoryService.deletePriceCheck(
      req.params.id,
      req.user._id,
      req.params.checkId,
    );
    return res.json({
      message: "Price check deleted successfully.",
      ...result,
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "CastError" ? 400 : 500);
    return res.status(statusCode).json({
      error: error.code || "ServerError",
      message: error.message || "Failed to delete price check.",
    });
  }
});

/**
 * DELETE /api/tracked-items/:id/history
 * Prune or clear price history for an item
 */
router.delete("/:id/history", async (req, res) => {
  try {
    const result = await priceHistoryService.prunePriceHistory(
      req.params.id,
      req.user._id,
      { olderThan: req.query.olderThan },
    );
    return res.json({
      message: `Pruned ${result.deletedCount} price check record(s).`,
      ...result,
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "CastError" ? 400 : 500);
    return res.status(statusCode).json({
      error: error.code || "ServerError",
      message: error.message || "Failed to prune price history.",
    });
  }
});

module.exports = {
  trackedItemsRouter: router,
};
