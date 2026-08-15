const mongoose = require("mongoose");

const priceCheckSchema = new mongoose.Schema(
  {
    trackedItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrackedItem",
      required: true,
      index: true,
    },
    checkedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
    status: {
      type: String,
      enum: ["success", "error", "skipped"],
      required: true,
    },
    price: {
      type: Number,
      min: 0,
      default: null,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "USD",
    },
    errorMessage: {
      type: String,
      default: null,
    },
    responseMs: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

priceCheckSchema.index({ trackedItem: 1, checkedAt: -1 });

module.exports = mongoose.model("PriceCheck", priceCheckSchema);
