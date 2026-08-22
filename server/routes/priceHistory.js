const express = require("express");
const { priceHistoryService } = require("../services/priceHistoryService");

const router = express.Router();

function handleServiceError(res, error, defaultMessage = "Internal server error.") {
  const statusCode = error.statusCode || (error.name === "CastError" ? 400 : 500);
  const errorCode = error.code || (statusCode === 404 ? "NotFound" : statusCode === 400 ? "ValidationError" : "ServerError");

  return res.status(statusCode).json({
    error: errorCode,
    message: error.message || defaultMessage,
  });
}

/**
 * GET /api/price-history/overview
 * Overview of price trends, latest prices, and 7-day sparklines across all active items
 */
router.get("/overview", async (req, res) => {
  try {
    const data = await priceHistoryService.getOverviewSummary(req.user._id, {
      limit: req.query.limit,
    });
    return res.json(data);
  } catch (error) {
    return handleServiceError(res, error, "Failed to retrieve price history overview.");
  }
});

/**
 * GET /api/price-history/:id
 * Paginated price check history with statistical summary (all-time & period high/low/average)
 */
router.get("/:id", async (req, res) => {
  try {
    const data = await priceHistoryService.getPriceHistory(req.params.id, req.user._id, {
      timeframe: req.query.timeframe,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      status: req.query.status,
      sort: req.query.sort,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json(data);
  } catch (error) {
    return handleServiceError(res, error, "Failed to retrieve price history.");
  }
});

/**
 * GET /api/price-history/:id/chart
 * Time-series aggregated and bucketed data for interactive charts
 */
router.get("/:id/chart", async (req, res) => {
  try {
    const data = await priceHistoryService.getChartData(req.params.id, req.user._id, {
      timeframe: req.query.timeframe,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      interval: req.query.interval,
    });
    return res.json(data);
  } catch (error) {
    return handleServiceError(res, error, "Failed to retrieve chart data.");
  }
});

/**
 * GET /api/price-history/:id/analytics
 * Advanced price analytics, period breakdowns, volatility, and deal evaluation
 */
router.get("/:id/analytics", async (req, res) => {
  try {
    const data = await priceHistoryService.getHistoryAnalytics(req.params.id, req.user._id);
    return res.json(data);
  } catch (error) {
    return handleServiceError(res, error, "Failed to retrieve price analytics.");
  }
});

/**
 * GET /api/price-history/:id/export
 * Download price history in CSV or JSON format
 */
router.get("/:id/export", async (req, res) => {
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
    return handleServiceError(res, error, "Failed to export price history.");
  }
});

/**
 * POST /api/price-history/:id
 * Manually log/record a price check entry for an item
 */
router.post("/:id", async (req, res) => {
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
    return handleServiceError(res, error, "Failed to log price check.");
  }
});

/**
 * DELETE /api/price-history/:id/checks/:checkId
 * Delete a specific price check entry
 */
router.delete("/:id/checks/:checkId", async (req, res) => {
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
    return handleServiceError(res, error, "Failed to delete price check.");
  }
});

/**
 * DELETE /api/price-history/:id
 * Prune or clear price history for an item
 */
router.delete("/:id", async (req, res) => {
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
    return handleServiceError(res, error, "Failed to prune price history.");
  }
});

module.exports = {
  priceHistoryRouter: router,
};
