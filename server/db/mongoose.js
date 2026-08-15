const mongoose = require("mongoose");

let hasConnected = false;

async function connectToMongo() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is required but was not provided.");
  }

  if (hasConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
  });

  hasConnected = true;

  mongoose.connection.on("error", (error) => {
    console.error("MongoDB connection error:", error.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected.");
  });

  console.log("MongoDB connected successfully.");

  return mongoose.connection;
}

module.exports = {
  connectToMongo,
};
