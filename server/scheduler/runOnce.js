const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { connectToMongo } = require("../db/mongoose");
const { processDueTrackedItems } = require("./priceScheduler");

async function runOnce() {
  try {
    await connectToMongo();
    await processDueTrackedItems();
    process.exit(0);
  } catch (error) {
    console.error("Run-once scheduler failed:", error.message);
    process.exit(1);
  }
}

runOnce();
