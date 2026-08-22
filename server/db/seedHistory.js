const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const mongoose = require("mongoose");
const { connectToMongo } = require("./mongoose");
const User = require("../models/User");
const TrackedItem = require("../models/TrackedItem");
const PriceCheck = require("../models/PriceCheck");
const Alert = require("../models/Alert");

const DEMO_USER_SUB = process.env.DEMO_USER_SUB || "demo-user@pricepulse.local";

const SEED_PRODUCTS = [
  {
    name: "Sony WH-1000XM5 Wireless Noise-Canceling Headphones",
    url: "https://www.amazon.com/dp/B09XS7JWHH",
    image: "https://m.media-amazon.com/images/I/61+ElEPu7vL._AC_SX679_.jpg",
    platform: "amazon",
    currency: "USD",
    targetPrice: 330.0,
    basePrice: 399.99,
    minPrice: 328.0,
    maxPrice: 399.99,
    currentPrice: 328.0,
    daysOfHistory: 45,
    checksPerDay: 8,
    volatility: "moderate",
    trend: "downward",
  },
  {
    name: "Apple MacBook Air 15-inch M3 Chip (16GB RAM, 512GB SSD)",
    url: "https://www.bestbuy.com/site/apple-macbook-air-15-laptop-m3-chip/6534606.p",
    image: "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6534/6534606_sd.jpg",
    platform: "bestbuy",
    currency: "USD",
    targetPrice: 1249.0,
    basePrice: 1499.0,
    minPrice: 1299.0,
    maxPrice: 1499.0,
    currentPrice: 1299.0,
    daysOfHistory: 60,
    checksPerDay: 6,
    volatility: "low",
    trend: "step_drops",
  },
  {
    name: "LG C3 Series 65-Inch Class OLED evo 4K Smart TV",
    url: "https://www.bestbuy.com/site/lg-65-class-c3-series-oled-4k-uhd-smart-webos-tv/6535929.p",
    image: "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6535/6535929_sd.jpg",
    platform: "bestbuy",
    currency: "USD",
    targetPrice: 1450.0,
    basePrice: 1899.99,
    minPrice: 1396.99,
    maxPrice: 1999.99,
    currentPrice: 1396.99,
    daysOfHistory: 50,
    checksPerDay: 6,
    volatility: "high",
    trend: "seasonal_drop",
  },
  {
    name: "PlayStation 5 Pro Digital Edition Console",
    url: "https://www.walmart.com/ip/PlayStation-5-Digital-Edition/5113283170",
    image: "https://i5.walmartimages.com/seo/Sony-PlayStation-5-Digital-Edition-Video-Game-Console_9cf3500d-ebf0-466d-9653-ff55a30ae250.jpg",
    platform: "walmart",
    currency: "USD",
    targetPrice: 449.99,
    basePrice: 499.99,
    minPrice: 479.99,
    maxPrice: 499.99,
    currentPrice: 489.99,
    daysOfHistory: 30,
    checksPerDay: 8,
    volatility: "low",
    trend: "stable",
  },
  {
    name: "Logitech MX Master 3S Wireless Performance Mouse",
    url: "https://www.amazon.com/dp/B09HM94VDS",
    image: "https://m.media-amazon.com/images/I/61ni3t1ryQL._AC_SX679_.jpg",
    platform: "amazon",
    currency: "USD",
    targetPrice: 85.0,
    basePrice: 99.99,
    minPrice: 79.99,
    maxPrice: 99.99,
    currentPrice: 84.99,
    daysOfHistory: 40,
    checksPerDay: 6,
    volatility: "moderate",
    trend: "cyclic_sales",
  },
  {
    name: "IKEA BILLY Bookcase White (80x28x202 cm)",
    url: "https://www.ikea.com/us/en/p/billy-bookcase-white-00263850/",
    image: "https://www.ikea.com/us/en/images/products/billy-bookcase-white__0625599_pe692385_s5.jpg",
    platform: "ikea",
    currency: "USD",
    targetPrice: 65.0,
    basePrice: 89.0,
    minPrice: 69.0,
    maxPrice: 89.0,
    currentPrice: 69.0,
    daysOfHistory: 35,
    checksPerDay: 4,
    volatility: "low",
    trend: "flat_with_promo",
  },
  {
    name: "Samsung Galaxy S24 Ultra 5G (256GB Titanium Black)",
    url: "https://www.ebay.com/itm/123456789012",
    image: "https://i.ebayimg.com/images/g/abcAAOSw12345678/s-l1600.jpg",
    platform: "ebay",
    currency: "USD",
    targetPrice: 1050.0,
    basePrice: 1299.99,
    minPrice: 979.0,
    maxPrice: 1299.99,
    currentPrice: 979.0,
    daysOfHistory: 60,
    checksPerDay: 8,
    volatility: "high",
    trend: "gradual_discount",
  },
  {
    name: "Nike Air Zoom Pegasus 40 Men's Road Running Shoes",
    url: "https://www.nike.com/t/air-zoom-pegasus-40-mens-road-running-shoes-MCnW5f",
    image: "https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/3396ee3c-08cc-4ada-baa9-655af12e3120/air-zoom-pegasus-40-mens-road-running-shoes-MCnW5f.png",
    platform: "nike",
    currency: "USD",
    targetPrice: 95.0,
    basePrice: 130.0,
    minPrice: 89.97,
    maxPrice: 130.0,
    currentPrice: 94.97,
    daysOfHistory: 45,
    checksPerDay: 6,
    volatility: "moderate",
    trend: "clearance_sale",
  },
];

/**
 * Generate a realistic historical price curve for a product
 */
function generateHistoricalPriceChecks(itemConfig, now = new Date()) {
  const {
    daysOfHistory = 30,
    checksPerDay = 6,
    basePrice,
    minPrice,
    maxPrice,
    currentPrice,
    currency = "USD",
    trend = "downward",
  } = itemConfig;

  const totalChecks = daysOfHistory * checksPerDay;
  const intervalMs = (daysOfHistory * 24 * 60 * 60 * 1000) / totalChecks;
  const startTimeMs = now.getTime() - daysOfHistory * 24 * 60 * 60 * 1000;

  const checks = [];
  const priceRange = maxPrice - minPrice;

  for (let i = 0; i < totalChecks; i++) {
    const timestamp = new Date(startTimeMs + i * intervalMs);
    const progress = i / (totalChecks - 1 || 1); // 0.0 to 1.0

    // Occasionally simulate a failed check (1 in 50)
    const isError = i > 0 && i < totalChecks - 1 && Math.random() < 0.02;

    if (isError) {
      checks.push({
        checkedAt: timestamp,
        status: "error",
        price: null,
        currency,
        responseMs: Math.floor(Math.random() * 300) + 700,
        errorMessage: "HTTP 503: Service Temporarily Unavailable",
      });
      continue;
    }

    let calculatedPrice;

    switch (trend) {
      case "downward": {
        // Starts near basePrice, drifts downwards with small noise to currentPrice
        const ideal = basePrice - progress * (basePrice - currentPrice);
        const noise = (Math.sin(i * 0.4) + Math.cos(i * 0.9)) * (priceRange * 0.08);
        calculatedPrice = Math.max(minPrice, Math.min(maxPrice, ideal + noise));
        break;
      }
      case "step_drops": {
        // Flat periods with distinct discount drops
        if (progress < 0.35) calculatedPrice = maxPrice;
        else if (progress < 0.7) calculatedPrice = basePrice - priceRange * 0.5;
        else calculatedPrice = currentPrice;
        const noise = (Math.random() - 0.5) * 5;
        calculatedPrice = Math.max(minPrice, Math.min(maxPrice, calculatedPrice + noise));
        break;
      }
      case "seasonal_drop": {
        // High, then major flash sale, then moderate rebound
        if (progress < 0.6) {
          calculatedPrice = maxPrice - (progress / 0.6) * (maxPrice - basePrice);
        } else if (progress < 0.85) {
          calculatedPrice = minPrice + Math.sin(i) * 15;
        } else {
          calculatedPrice = currentPrice;
        }
        break;
      }
      case "cyclic_sales": {
        // Oscillates with weekend sales
        const cycle = Math.sin(progress * Math.PI * 8); // 4 sales cycles
        calculatedPrice = basePrice - (cycle > 0.4 ? priceRange * 0.75 : 0);
        const noise = (Math.random() - 0.5) * 4;
        calculatedPrice = Math.max(minPrice, Math.min(maxPrice, calculatedPrice + noise));
        break;
      }
      case "gradual_discount": {
        // Steady decline with daily minor fluctuations
        const decay = Math.pow(1 - progress, 1.2);
        calculatedPrice = minPrice + decay * (maxPrice - minPrice);
        const noise = (Math.sin(i * 0.5) * priceRange * 0.05);
        calculatedPrice = Math.max(minPrice, Math.min(maxPrice, calculatedPrice + noise));
        break;
      }
      case "clearance_sale": {
        // High for first half, then steep discount to clear inventory
        if (progress < 0.5) {
          calculatedPrice = basePrice;
        } else {
          const subProg = (progress - 0.5) / 0.5;
          calculatedPrice = basePrice - subProg * (basePrice - currentPrice);
        }
        break;
      }
      case "stable":
      default: {
        const noise = (Math.sin(i * 0.3) * priceRange * 0.3);
        calculatedPrice = basePrice + noise;
        break;
      }
    }

    // Force the final point to exactly equal currentPrice
    if (i === totalChecks - 1) {
      calculatedPrice = currentPrice;
    }

    const roundedPrice = Math.round(calculatedPrice * 100) / 100;
    const responseMs = Math.floor(Math.random() * 220) + 95; // 95ms - 315ms

    checks.push({
      checkedAt: timestamp,
      status: "success",
      price: roundedPrice,
      currency,
      responseMs,
      errorMessage: null,
    });
  }

  return checks;
}

/**
 * Seed comprehensive price history for specified users
 */
async function seedComprehensiveHistory(targetUser = null) {
  const usersToSeed = [];

  if (targetUser) {
    usersToSeed.push(targetUser);
  } else {
    // Find or create default demo user
    const demoUser = await User.findOneAndUpdate(
      { auth0Sub: DEMO_USER_SUB },
      {
        $set: {
          auth0Sub: DEMO_USER_SUB,
          email: DEMO_USER_SUB,
          name: "Demo Shopper",
          picture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop&crop=faces",
          isActive: true,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    usersToSeed.push(demoUser);

    // Also seed for all existing active users in database
    const otherUsers = await User.find({
      _id: { $ne: demoUser._id },
      isActive: true,
    }).lean();

    for (const u of otherUsers) {
      usersToSeed.push(u);
    }
  }

  console.log(`\nFound ${usersToSeed.length} user(s) to seed.`);

  let totalItemsSeeded = 0;
  let totalChecksSeeded = 0;
  let totalAlertsSeeded = 0;

  for (const user of usersToSeed) {
    console.log(`\n=================================================`);
    console.log(`Seeding data for user: ${user.name || user.email || user.auth0Sub} (${user._id})`);
    console.log(`=================================================`);

    // Remove existing tracked items & associated records for clean seed
    const existingItems = await TrackedItem.find({ user: user._id }).lean();
    const existingItemIds = existingItems.map((i) => i._id);

    if (existingItemIds.length > 0) {
      await Promise.all([
        PriceCheck.deleteMany({ trackedItem: { $in: existingItemIds } }),
        Alert.deleteMany({ trackedItem: { $in: existingItemIds } }),
        TrackedItem.deleteMany({ _id: { $in: existingItemIds } }),
      ]);
      console.log(`Cleared ${existingItemIds.length} previous item(s) for user.`);
    }

    const now = new Date();

    for (const product of SEED_PRODUCTS) {
      // Create TrackedItem
      const trackedItem = await TrackedItem.create({
        user: user._id,
        name: product.name,
        url: product.url,
        image: product.image,
        platform: product.platform,
        targetPrice: product.targetPrice,
        currency: product.currency,
        active: true,
        lastPrice: product.currentPrice,
        lastStatus: "success",
        lastCheckedAt: now,
        nextCheckAt: new Date(now.getTime() + 60 * 60 * 1000), // Next check in 1 hour
        consecutiveFailures: 0,
        failureReason: null,
      });

      // Generate history points
      const rawChecks = generateHistoricalPriceChecks(product, now);

      // Insert all price checks in bulk
      const checksToInsert = rawChecks.map((c) => ({
        ...c,
        trackedItem: trackedItem._id,
      }));

      await PriceCheck.insertMany(checksToInsert);

      // Create alert if target price reached or dropped
      if (product.targetPrice && product.currentPrice <= product.targetPrice) {
        await Alert.create({
          trackedItem: trackedItem._id,
          user: user._id,
          type: "target_price_reached",
          payload: {
            name: product.name,
            url: product.url,
            targetPrice: product.targetPrice,
            currentPrice: product.currentPrice,
            previousPrice: product.basePrice,
            currency: product.currency,
            checkedAt: now.toISOString(),
          },
          sentAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        });
        totalAlertsSeeded += 1;
      } else if (product.currentPrice < product.basePrice) {
        await Alert.create({
          trackedItem: trackedItem._id,
          user: user._id,
          type: "price_dropped",
          payload: {
            name: product.name,
            url: product.url,
            targetPrice: product.targetPrice,
            currentPrice: product.currentPrice,
            previousPrice: product.basePrice,
            dropAmount: Math.round((product.basePrice - product.currentPrice) * 100) / 100,
            currency: product.currency,
            checkedAt: now.toISOString(),
          },
          sentAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
        });
        totalAlertsSeeded += 1;
      }

      totalItemsSeeded += 1;
      totalChecksSeeded += checksToInsert.length;

      console.log(`  ✓ Seeded: ${product.name.slice(0, 42)}... (${checksToInsert.length} history records, latest: $${product.currentPrice})`);
    }
  }

  console.log(`\n=================================================`);
  console.log(`SEEDING COMPLETED SUCCESSFULLY`);
  console.log(`Total Tracked Items : ${totalItemsSeeded}`);
  console.log(`Total Price Checks  : ${totalChecksSeeded}`);
  console.log(`Total Alerts        : ${totalAlertsSeeded}`);
  console.log(`Demo User Sub       : ${DEMO_USER_SUB}`);
  console.log(`=================================================\n`);
}

async function main() {
  const args = process.argv.slice(2);
  let customSub = null;
  let customUri = null;

  for (const arg of args) {
    if (arg.startsWith("--sub=")) {
      customSub = arg.slice("--sub=".length).trim();
    } else if (arg.startsWith("--uri=")) {
      customUri = arg.slice("--uri=".length).trim();
    }
  }

  if (customUri) {
    process.env.MONGODB_URI = customUri;
  }

  try {
    await connectToMongo();

    let targetUser = null;
    if (customSub) {
      targetUser = await User.findOneAndUpdate(
        { auth0Sub: customSub },
        {
          $set: {
            auth0Sub: customSub,
            isActive: true,
          },
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
      console.log(`Targeting user: "${targetUser.name || targetUser.email || customSub}" (sub: ${customSub})`);
    }

    await seedComprehensiveHistory(targetUser);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error.message || error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  seedComprehensiveHistory,
  SEED_PRODUCTS,
  generateHistoricalPriceChecks,
};
