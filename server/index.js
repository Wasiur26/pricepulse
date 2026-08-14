const express = require("express");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT;

if (!PORT) {
  console.error("Error: PORT is not defined in the environment variables.");
  process.exit(1);
}

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "PricePulse API is running" });
});

app.listen(PORT, () => {
  console.log(`PricePulse server running on http://localhost:${PORT}`);
});
