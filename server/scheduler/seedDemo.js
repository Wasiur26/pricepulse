const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const mongoose = require("mongoose");
const { connectToMongo } = require("../db/mongoose");
const User = require("../models/User");
const TrackedItem = require("../models/TrackedItem");
const PriceCheck = require("../models/PriceCheck");
const Alert = require("../models/Alert");
const { processDueTrackedItems } = require("./priceScheduler");

const DEMO_USER_SUB = process.env.DEMO_USER_SUB || "demo-user@pricepulse.local";

const DEMO_ITEMS = [
  {
    name: "IKEA Billy Bookcase (happy path)",
    url:
      process.env.DEMO_GOOD_URL ||
      "https://www.ikea.com/us/en/p/billy-bookcase-white-90522043/",
    targetPrice: 90,
  },
  {
    name: "HTTP 404 (error path)",
    url:
      process.env.DEMO_BROKEN_URL ||
      "https://github.com/this-repo-definitely-does-not-exist-xyz/",
    targetPrice: null,
  },
  {
    name: "No price on page (skipped path)",
    url: process.env.DEMO_NOPRICE_URL || "https://example.com/",
    targetPrice: null,
  },
];

function pad(value, width) {
  return String(value).padEnd(width).slice(0, width);
}

function formatDelta(date) {
  if (!date) return "—";
  const ms = date.getTime() - Date.now();
  const abs = Math.abs(ms);
  if (abs < 60_000) return "due now";
  const mins = Math.round(abs / 60_000);
  return ms >= 0 ? `in ${mins} min` : `${mins} min ago`;
}

async function resetDemoData(userId) {
  const items = await TrackedItem.find({ user: userId }).lean();
  const itemIds = items.map((item) => item._id);
  if (itemIds.length > 0) {
    await Promise.all([
      PriceCheck.deleteMany({ trackedItem: { $in: itemIds } }),
      Alert.deleteMany({ trackedItem: { $in: itemIds } }),
      TrackedItem.deleteMany({ _id: { $in: itemIds } }),
    ]);
  }
  console.log(`  Removed ${itemIds.length} previous demo item(s) (and their checks/alerts).`);
}

async function main() {
  await connectToMongo();

  console.log("=================================================");
  console.log("PRICEPULSE SCHEDULER DEMO SEED");
  console.log("=================================================");

  const user = await User.findOneAndUpdate(
    { auth0Sub: DEMO_USER_SUB },
    {
      $set: {
        auth0Sub: DEMO_USER_SUB,
        email: DEMO_USER_SUB,
        name: "Demo User",
        isActive: true,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  console.log(`Demo user ready: "${user.name}" (auth0Sub: ${DEMO_USER_SUB})`);

  await resetDemoData(user._id);

  console.log("\nSeeding tracked items (all due immediately)...");
  const created = [];
  for (const demo of DEMO_ITEMS) {
    const item = await TrackedItem.create({
      user: user._id,
      name: demo.name,
      url: demo.url,
      targetPrice: demo.targetPrice,
      currency: "USD",
      active: true,
      nextCheckAt: new Date(),
      lastStatus: "pending",
    });
    created.push(item);
    console.log(`  + ${item.name}`);
    console.log(`      ${item.url}`);
  }

  console.log("\nRunning scheduler pass...");
  const result = await processDueTrackedItems({ concurrency: 5 });
  console.log(`  ${result.status}: processed ${result.processedCount} item(s)`);

  const header = `${pad("ITEM", 40)}${pad("STATUS", 9)}${pad("PRICE", 12)}${pad("NEXT CHECK", 12)}${pad("RETRIES", 8)}REASON`;
  console.log("\n" + "-".repeat(header.length));
  console.log(header);
  console.log("-".repeat(header.length));

  for (const item of created) {
    const fresh = await TrackedItem.findById(item._id).lean();
    if (!fresh) continue;
    const price = fresh.lastPrice != null ? `${fresh.lastPrice} ${fresh.currency}` : "—";
    const nextCheck = fresh.lastStatus === "pending" ? "—" : formatDelta(fresh.nextCheckAt);
    console.log(
      `${pad(fresh.name, 40)}${pad(fresh.lastStatus, 9)}${pad(price, 12)}${pad(nextCheck, 12)}${pad(fresh.consecutiveFailures || 0, 8)}${fresh.failureReason || ""}`,
    );
  }
  console.log("-".repeat(header.length));

  const alerts = await Alert.find({ user: user._id }).sort({ createdAt: 1 }).lean();
  console.log("\nAlerts generated:");
  if (alerts.length === 0) {
    console.log("  (none)");
  } else {
    for (const alert of alerts) {
      const price = alert.payload.currentPrice != null ? `$${alert.payload.currentPrice}` : "—";
      console.log(`  • ${alert.type}: ${alert.payload.name} -> ${price}`);
    }
  }

  console.log("\nDone. Tip: re-run to reset and repeat the demo.");
  mongoose.connection.removeAllListeners("disconnected");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed demo failed:", error.message);
  process.exit(1);
});
