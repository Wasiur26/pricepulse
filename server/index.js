const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mongoose = require("mongoose");
const { connectToMongo } = require("./db/mongoose");
const { startPriceScheduler } = require("./scheduler/priceScheduler");
const { requireUser } = require("./middleware/requireUser");
const { trackedItemsRouter } = require("./routes/trackedItems");
const { priceHistoryRouter } = require("./routes/priceHistory");
const { schedulerRouter } = require("./routes/scheduler");

const app = express();
const PORT = process.env.PORT;

if (!PORT) {
  console.error("Error: PORT is not defined in the environment variables.");
  process.exit(1);
}

app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  }),
);

app.get("/", (req, res) => {
  res.json({ message: "PricePulse API is running" });
});

app.get("/health", (req, res) => {
  const readyState = mongoose.connection.readyState;
  const mongoStates = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  res.json({
    status: "ok",
    mongo: mongoStates[readyState] || "unknown",
  });
});

app.use("/api/tracked-items", requireUser, trackedItemsRouter);
app.use("/api/price-history", requireUser, priceHistoryRouter);
app.use("/api/scheduler", schedulerRouter);

async function bootstrap() {
  try {
    await connectToMongo();

    app.listen(PORT, () => {
      console.log(`PricePulse server running on http://localhost:${PORT}`);
    });

    startPriceScheduler();
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

bootstrap();
