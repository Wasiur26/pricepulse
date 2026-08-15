const mongoose = require("mongoose");

const trackedItemSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    targetPrice: {
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
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    lastStatus: {
      type: String,
      enum: ["pending", "success", "error", "skipped"],
      default: "pending",
    },
    lastCheckedAt: {
      type: Date,
      default: null,
    },
    nextCheckAt: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
    checkInProgress: {
      type: Boolean,
      default: false,
      index: true,
    },
    lockExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    consecutiveFailures: {
      type: Number,
      default: 0,
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

trackedItemSchema.index({ active: 1, nextCheckAt: 1 });
trackedItemSchema.index({ active: 1, checkInProgress: 1, lockExpiresAt: 1 });

module.exports = mongoose.model("TrackedItem", trackedItemSchema);
