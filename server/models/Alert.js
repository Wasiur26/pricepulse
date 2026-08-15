const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    trackedItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrackedItem",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["target_price_reached", "price_dropped"],
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

alertSchema.index({ user: 1, sentAt: 1, createdAt: -1 });

module.exports = mongoose.model("Alert", alertSchema);
