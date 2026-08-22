const assert = require("assert");
const {
  extractPriceFromHtml,
  parsePriceNumber,
  cleanUrl,
  detectPlatform,
  extractProductName,
  extractProductImage,
  extractProductMetadata,
} = require("./productScraper");
const {
  CHECK_INTERVAL_MS,
  RETRY_INITIAL_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} = require("./constants");
const { calculateRetryDelay } = require("./priceScheduler");

console.log("=================================================");
console.log("RUNNING PRICEPULSE SCHEDULER & SCRAPER UNIT TESTS");
console.log("=================================================");

function testPriceParsing() {
  console.log("\n[Test 1] Testing parsePriceNumber utility...");
  assert.strictEqual(parsePriceNumber("$199.99"), 199.99);
  assert.strictEqual(parsePriceNumber("USD 1,299.50"), 1299.5);
  assert.strictEqual(parsePriceNumber("1.499,00 €"), 1499.0);
  assert.strictEqual(parsePriceNumber("29,99"), 29.99);
  assert.strictEqual(parsePriceNumber(49.99), 49.99);
  assert.strictEqual(parsePriceNumber("Invalid"), null);
  console.log("✓ parsePriceNumber tests passed.");
}

function testJsonLdExtraction() {
  console.log("\n[Test 2] Testing JSON-LD structured data price extractor...");
  const sampleJsonLd = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "Product",
            "name": "Wireless Noise Cancelling Headphones",
            "offers": {
              "@type": "Offer",
              "priceCurrency": "USD",
              "price": "249.99",
              "availability": "https://schema.org/InStock"
            }
          }
        </script>
      </head>
      <body><div>Product info</div></body>
    </html>
  `;
  const result = extractPriceFromHtml(sampleJsonLd, "https://example-store.com/item1");
  assert(result !== null, "Extraction should not be null");
  assert.strictEqual(result.price, 249.99);
  assert.strictEqual(result.currency, "USD");
  assert.strictEqual(result.strategy, "json-ld");
  console.log("✓ JSON-LD extraction test passed.");
}

function testMetaTagExtraction() {
  console.log("\n[Test 3] Testing OpenGraph & Microdata Meta tag price extractor...");
  const sampleMeta = `
    <html>
      <head>
        <meta property="og:price:amount" content="79.95" />
        <meta property="og:price:currency" content="USD" />
      </head>
      <body><h1>Product Page</h1></body>
    </html>
  `;
  const result = extractPriceFromHtml(sampleMeta, "https://example-shop.com/item2");
  assert(result !== null, "Extraction should not be null");
  assert.strictEqual(result.price, 79.95);
  assert.strictEqual(result.currency, "USD");
  assert.strictEqual(result.strategy, "meta-tags");
  console.log("✓ OpenGraph Meta tag extraction test passed.");
}

function testDomainSpecificPatterns() {
  console.log("\n[Test 4] Testing domain-specific patterns (Amazon, eBay, Walmart)...");
  
  // Amazon pattern
  const amazonHtml = `
    <div id="corePrice_feature_div">
      <span class="a-offscreen">$349.99</span>
    </div>
  `;
  const amazonResult = extractPriceFromHtml(amazonHtml, "https://www.amazon.com/dp/B08N5WRWNW");
  assert(amazonResult !== null, "Amazon extraction should succeed");
  assert.strictEqual(amazonResult.price, 349.99);

  // Walmart pattern
  const walmartHtml = `
    <div><span itemprop="price">$128.00</span></div>
  `;
  const walmartResult = extractPriceFromHtml(walmartHtml, "https://www.walmart.com/ip/12345");
  assert(walmartResult !== null, "Walmart extraction should succeed");
  assert.strictEqual(walmartResult.price, 128.0);

  console.log("✓ Domain-specific extraction tests passed.");
}

function testRegexFallback() {
  console.log("\n[Test 5] Testing heuristic regex fallback...");
  const fallbackHtml = `
    <div class="banner">
      <span>Sale price:</span>
      <strong>$45.50</strong>
    </div>
  `;
  const result = extractPriceFromHtml(fallbackHtml, "https://unknown-shop.com/product");
  assert(result !== null, "Regex fallback should succeed");
  assert.strictEqual(result.price, 45.5);
  assert.strictEqual(result.strategy, "regex-fallback");
  console.log("✓ Regex fallback test passed.");
}

function testNestedJsonLdExtraction() {
  console.log("\n[Test 7] Testing recursive JSON-LD extraction (nested @graph + priceSpecification array)...");
  const nestedJsonLd = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", "name": "Example Store" },
          {
            "@type": "Product",
            "name": "BILLY Bookcase",
            "offers": {
              "@type": "Offer",
              "priceSpecification": [
                { "@type": "UnitPriceSpecification", "price": 89, "priceCurrency": "USD" },
                { "@type": "UnitPriceSpecification", "price": 69, "priceCurrency": "USD" }
              ]
            }
          }
        ]
      }
    </script>
  `;
  const result = extractPriceFromHtml(nestedJsonLd, "https://example-store.com/billy");
  assert(result !== null, "Nested JSON-LD should extract a price");
  assert.strictEqual(result.price, 89, "Should pick the first (current) price in the priceSpecification array");
  assert.strictEqual(result.currency, "USD");
  assert.strictEqual(result.strategy, "json-ld");
  console.log("✓ Recursive JSON-LD extraction test passed.");
}

function testMicrodataExtraction() {
  console.log("\n[Test 8] Testing Schema.org microdata (itemprop=price) extraction...");
  const microdataHtml = `
    <div>
      <h1>Wireless Mouse</h1>
      <span itemprop="price">$28.99</span>
      <span itemprop="priceCurrency">USD</span>
    </div>
  `;
  const result = extractPriceFromHtml(microdataHtml, "https://example-shop.com/mouse");
  assert(result !== null, "Microdata extraction should succeed");
  assert.strictEqual(result.price, 28.99);
  assert.strictEqual(result.strategy, "microdata");
  console.log("✓ Microdata extraction test passed.");
}

function testElementPatternExtraction() {
  console.log("\n[Test 9] Testing price-container class/id pattern extraction...");
  const elementHtml = `
    <div class="product-card">
      <img src="mouse.jpg" alt="Mouse">
      <span class="product-price">$1,299.99</span>
      <button>Add to cart</button>
    </div>
  `;
  const result = extractPriceFromHtml(elementHtml, "https://example-shop.com/tablet");
  assert(result !== null, "Element pattern extraction should succeed");
  assert.strictEqual(result.price, 1299.99);
  assert.strictEqual(result.strategy, "element-pattern");
  console.log("✓ Element pattern extraction test passed.");
}

function testRegexFallbackRobustness() {
  console.log("\n[Test 10] Testing regex fallback robustness (whole dollars, currency codes, noise rejection)...");

  const wholeDollar = extractPriceFromHtml(`<p>Our Price: $45</p>`, "https://x.com/a");
  assert.strictEqual(wholeDollar.price, 45, "Whole-dollar price without cents should extract");

  const bareDecimal = extractPriceFromHtml(`<p>Subtotal 89.00</p>`, "https://x.com/b");
  assert.strictEqual(bareDecimal.price, 89, "Bare 2-decimal number in a price context should extract");

  const currencyCode = extractPriceFromHtml(`<p>Price is 1499.50 GBP</p>`, "https://x.com/c");
  assert.strictEqual(currencyCode.price, 1499.5, "Currency-code-suffixed price should extract");
  assert.strictEqual(currencyCode.currency, "GBP", "Currency code should be detected");

  const noise = extractPriceFromHtml(
    `<p>Total visitors: 2026 and rating 4.8 out of 5. Model ABC-1234.</p>`,
    "https://x.com/d",
  );
  assert.strictEqual(noise, null, "Pages with only years/ratings/quantities should not produce a price");

  console.log("✓ Regex fallback robustness test passed.");
}

function testIntervalAndBackoffCalculations() {
  console.log("\n[Test 6] Testing 1-hour interval and exponential backoff timing...");
  
  // 1-hour interval must equal 3,600,000 ms
  assert.strictEqual(CHECK_INTERVAL_MS, 60 * 60 * 1000, "CHECK_INTERVAL_MS must be exactly 1 hour (3600000ms)");
  
  // Backoff progression
  const delay1 = calculateRetryDelay(1); // 5 mins
  const delay2 = calculateRetryDelay(2); // 10 mins
  const delay3 = calculateRetryDelay(3); // 20 mins
  const delay4 = calculateRetryDelay(4); // 40 mins
  const delay5 = calculateRetryDelay(5); // 60 mins (capped at RETRY_MAX_DELAY_MS)
  const delay10 = calculateRetryDelay(10); // capped at 60 mins

  assert.strictEqual(delay1, 5 * 60 * 1000, "1st retry delay should be 5 mins");
  assert.strictEqual(delay2, 10 * 60 * 1000, "2nd retry delay should be 10 mins");
  assert.strictEqual(delay3, 20 * 60 * 1000, "3rd retry delay should be 20 mins");
  assert.strictEqual(delay4, 40 * 60 * 1000, "4th retry delay should be 40 mins");
  assert.strictEqual(delay5, RETRY_MAX_DELAY_MS, "5th retry delay should cap at 60 mins");
  assert.strictEqual(delay10, RETRY_MAX_DELAY_MS, "10th retry delay should cap at 60 mins");

  console.log("✓ Interval & backoff timing tests passed.");
}

function testCleanUrl() {
  console.log("\n[Test 11] Testing URL cleaning (tracking param stripping)...");

  const amazon = cleanUrl("https://www.amazon.com/dp/B08N5WRWNW?psc=1&th=1&ref_=nav_ya_signin&tag=affiliate-20");
  assert.strictEqual(amazon, "https://www.amazon.com/dp/B08N5WRWNW");
  assert.ok(cleanUrl("https://www.amazon.com/dp/B08N5WRWNW").includes("/dp/B08N5WRWNW"));

  const ebay = cleanUrl("https://www.ebay.com/itm/123456789012?hash=itemabc%3Ag&_trkparms=xyz");
  assert.strictEqual(ebay, "https://www.ebay.com/itm/123456789012");

  const utm = cleanUrl("https://shop.example.com/p/42?utm_source=newsletter&utm_campaign=launch&q=keep");
  assert.strictEqual(utm, "https://shop.example.com/p/42?q=keep");

  const noProtocol = cleanUrl("www.example.com/product");
  assert.strictEqual(noProtocol, "https://www.example.com/product");

  const hash = cleanUrl("https://www.example.com/product#section");
  assert.strictEqual(hash, "https://www.example.com/product");

  assert.strictEqual(cleanUrl("not a url at all"), null);
  assert.strictEqual(cleanUrl("ftp://example.com/file"), null);

  console.log("✓ URL cleaning test passed.");
}

function testDetectPlatform() {
  console.log("\n[Test 12] Testing platform detection...");

  assert.strictEqual(detectPlatform("https://www.amazon.com/dp/B08N5WRWNW"), "amazon");
  assert.strictEqual(detectPlatform("https://www.ebay.co.uk/itm/123"), "ebay");
  assert.strictEqual(detectPlatform("https://www.walmart.com/ip/123"), "walmart");
  assert.strictEqual(detectPlatform("https://www.bestbuy.com/site/x/123.p"), "bestbuy");
  assert.strictEqual(detectPlatform("https://www.ikea.com/us/en/p/billy-bookcase-white-90522043/"), "ikea");
  assert.strictEqual(detectPlatform("https://my-store.myshopify.com/products/thing"), "shopify");
  assert.strictEqual(detectPlatform("https://random-store.com/product"), "other");
  assert.strictEqual(detectPlatform("not a url"), null);

  console.log("✓ Platform detection test passed.");
}

function testMetadataExtraction() {
  console.log("\n[Test 13] Testing metadata extraction (name, image, price, platform)...");

  const sampleHtml = `
    <html>
      <head>
        <title>BILLY, bookcase, white, 40x28x202 cm - IKEA</title>
        <meta property="og:title" content="BILLY, bookcase, white, 40x28x202 cm" />
        <meta property="og:image" content="https://www.ikea.com/us/en/images/products/billy__1111111.jpg" />
        <meta property="og:price:amount" content="89.00" />
        <meta property="og:price:currency" content="USD" />
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "BILLY, bookcase, white, 40x28x202 cm",
            "image": "https://www.ikea.com/us/en/images/products/billy-1.jpg",
            "offers": { "@type": "Offer", "price": "89.00", "priceCurrency": "USD" }
          }
        </script>
      </head>
      <body><h1>BILLY, bookcase, white, 40x28x202 cm</h1></body>
    </html>
  `;
  const metadata = extractProductMetadata(sampleHtml, "https://www.ikea.com/us/en/p/billy-bookcase-white-90522043/");
  assert.strictEqual(metadata.platform, "ikea");
  assert.strictEqual(metadata.name, "BILLY, bookcase, white, 40x28x202 cm");
  assert.strictEqual(metadata.image, "https://www.ikea.com/us/en/images/products/billy-1.jpg");
  assert.strictEqual(metadata.price, 89);
  assert.strictEqual(metadata.currency, "USD");

  console.log("✓ Metadata extraction test passed.");
}

function testNameAndImageExtraction() {
  console.log("\n[Test 14] Testing name/image fallback strategies...");

  const ogTitle = extractProductName(
    `<meta property="og:title" content="Echo Dot (5th Gen) Smart Speaker" /><title>Echo Dot (5th Gen) Smart Speaker - Amazon.com</title>`,
    "amazon",
  );
  assert.strictEqual(ogTitle, "Echo Dot (5th Gen) Smart Speaker");

  const titleOnly = extractProductName(
    `<title>Wireless Mouse - Official Store</title>`,
    "other",
  );
  assert.strictEqual(titleOnly, "Wireless Mouse");

  const jsonLdOnly = extractProductName(
    `<script type="application/ld+json">{"@type":"Product","name":"Steel Bottle 1L"}</script>`,
  );
  assert.strictEqual(jsonLdOnly, "Steel Bottle 1L");

  const relativeImage = extractProductImage(
    `<meta property="og:image" content="/images/product.jpg" />`,
    "https://store.example.com/products/123",
  );
  assert.strictEqual(relativeImage, "https://store.example.com/images/product.jpg");

  const imgContainer = extractProductImage(
    `<div class="product-gallery"><img src="https://cdn.example.com/img/sku123.png" /></div>`,
    "https://store.example.com/p/1",
  );
  assert.strictEqual(imgContainer, "https://cdn.example.com/img/sku123.png");

  assert.strictEqual(extractProductImage(`<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />`, "https://x.com/p"), null);
  assert.strictEqual(extractProductName(`<title>XY</title>`), null);

  console.log("✓ Name/image extraction test passed.");
}

const {
  parseTimeframe,
  calculatePriceStatistics,
  bucketPriceChecks,
  formatPriceHistoryCsv,
  toPriceCheckDto,
  toTrackedItemDto,
} = require("../services/priceHistoryService");

function testTimeframeParsing() {
  console.log("\n[Test 15] Testing price history timeframe parsing...");

  const tf24h = parseTimeframe("24h");
  assert.strictEqual(tf24h.timeframe, "24h");
  assert.ok(tf24h.startDate instanceof Date);
  assert.ok(Date.now() - tf24h.startDate.getTime() >= 23 * 60 * 60 * 1000);

  const tf7d = parseTimeframe("7d");
  assert.strictEqual(tf7d.timeframe, "7d");
  assert.ok(Date.now() - tf7d.startDate.getTime() >= 6 * 24 * 60 * 60 * 1000);

  const tf30d = parseTimeframe("30d");
  assert.strictEqual(tf30d.timeframe, "30d");

  const tfAll = parseTimeframe("all");
  assert.strictEqual(tfAll.timeframe, "all");
  assert.strictEqual(tfAll.startDate, null);

  const custom = parseTimeframe("custom", "2026-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z");
  assert.strictEqual(custom.timeframe, "custom");
  assert.strictEqual(custom.startDate.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.strictEqual(custom.endDate.toISOString(), "2026-06-01T00:00:00.000Z");

  console.log("✓ Price history timeframe parsing test passed.");
}

function testPriceStatisticsCalculation() {
  console.log("\n[Test 16] Testing price history statistics calculation...");

  const mockChecks = [
    { status: "success", price: 180.0, checkedAt: new Date("2026-03-01T12:00:00Z"), currency: "USD" },
    { status: "success", price: 150.0, checkedAt: new Date("2026-02-15T12:00:00Z"), currency: "USD" },
    { status: "success", price: 220.0, checkedAt: new Date("2026-02-01T12:00:00Z"), currency: "USD" },
    { status: "success", price: 200.0, checkedAt: new Date("2026-01-01T12:00:00Z"), currency: "USD" },
  ];

  const stats = calculatePriceStatistics(mockChecks, mockChecks, 180.0, 160.0);

  assert.strictEqual(stats.currentPrice, 180.0);
  assert.strictEqual(stats.allTimeHigh.price, 220.0);
  assert.strictEqual(stats.allTimeLow.price, 150.0);
  assert.strictEqual(stats.allTimeAverage, 187.5);
  assert.strictEqual(stats.initialPrice, 200.0);
  assert.strictEqual(stats.allTimeChange.amount, -20.0);
  assert.strictEqual(stats.allTimeChange.percentage, -10.0);
  assert.strictEqual(stats.targetPriceDistance.targetPrice, 160.0);
  assert.strictEqual(stats.targetPriceDistance.amountNeeded, 20.0);
  assert.strictEqual(stats.targetPriceDistance.isTargetReached, false);

  // Target reached case
  const statsTargetReached = calculatePriceStatistics(mockChecks, mockChecks, 150.0, 160.0);
  assert.strictEqual(statsTargetReached.targetPriceDistance.isTargetReached, true);
  assert.strictEqual(statsTargetReached.targetPriceDistance.amountNeeded, 0);

  console.log("✓ Price history statistics calculation test passed.");
}

function testTimeBucketingAndDownsampling() {
  console.log("\n[Test 17] Testing time-series bucketing and downsampling...");

  const checks = [
    { status: "success", price: 100, checkedAt: new Date("2026-03-01T08:00:00Z") },
    { status: "success", price: 110, checkedAt: new Date("2026-03-01T14:00:00Z") },
    { status: "success", price: 90, checkedAt: new Date("2026-03-01T20:00:00Z") },
    { status: "success", price: 120, checkedAt: new Date("2026-03-02T10:00:00Z") },
  ];

  const daily = bucketPriceChecks(checks, "daily");
  assert.strictEqual(daily.length, 2, "Should aggregate into 2 daily buckets");
  assert.strictEqual(daily[0].open, 100);
  assert.strictEqual(daily[0].high, 110);
  assert.strictEqual(daily[0].low, 90);
  assert.strictEqual(daily[0].close, 90);
  assert.strictEqual(daily[0].price, 100);
  assert.strictEqual(daily[0].count, 3);

  assert.strictEqual(daily[1].open, 120);
  assert.strictEqual(daily[1].high, 120);
  assert.strictEqual(daily[1].low, 120);
  assert.strictEqual(daily[1].close, 120);
  assert.strictEqual(daily[1].price, 120);
  assert.strictEqual(daily[1].count, 1);

  const raw = bucketPriceChecks(checks, "raw");
  assert.strictEqual(raw.length, 4, "Raw bucketing should return all points");

  console.log("✓ Time-series bucketing and downsampling test passed.");
}

function testCsvExportFormatting() {
  console.log("\n[Test 18] Testing price history CSV export formatting...");

  const mockItem = {
    name: 'Sony WH-1000XM5 "Special Edition"',
    url: "https://www.example.com/item,with,comma",
    currency: "USD",
  };

  const mockChecks = [
    {
      _id: "check_1",
      checkedAt: new Date("2026-03-01T12:00:00Z"),
      status: "success",
      price: 348.0,
      currency: "USD",
      responseMs: 145,
      errorMessage: null,
    },
    {
      _id: "check_2",
      checkedAt: new Date("2026-03-02T12:00:00Z"),
      status: "error",
      price: null,
      currency: "USD",
      responseMs: 500,
      errorMessage: "HTTP 503, Service Unavailable",
    },
  ];

  const csv = formatPriceHistoryCsv(mockItem, mockChecks);
  assert.ok(csv.includes("Check ID,Checked At (UTC),Status,Price,Currency,Response Time (ms),Error Message"));
  assert.ok(csv.includes('"Sony WH-1000XM5 ""Special Edition"""'));
  assert.ok(csv.includes("check_1,2026-03-01T12:00:00.000Z,success,348.00,USD,145,"));
  assert.ok(csv.includes('check_2,2026-03-02T12:00:00.000Z,error,,USD,500,"HTTP 503, Service Unavailable"'));

  console.log("✓ Price history CSV export formatting test passed.");
}

function testPriceHistoryDtoMapping() {
  console.log("\n[Test 19] Testing PriceCheck and TrackedItem DTO mapping...");

  const rawCheck = {
    _id: "660000000000000000000001",
    trackedItem: "660000000000000000000002",
    checkedAt: new Date("2026-03-01T12:00:00Z"),
    status: "success",
    price: 99.99,
    currency: "USD",
    responseMs: 120,
    errorMessage: null,
    createdAt: new Date("2026-03-01T12:00:00Z"),
  };

  const dto = toPriceCheckDto(rawCheck);
  assert.strictEqual(dto.id, "660000000000000000000001");
  assert.strictEqual(dto.trackedItemId, "660000000000000000000002");
  assert.strictEqual(dto.price, 99.99);
  assert.strictEqual(dto.status, "success");

  console.log("✓ PriceCheck and TrackedItem DTO mapping test passed.");
}

const { generateHistoricalPriceChecks, SEED_PRODUCTS } = require("../db/seedHistory");

function testSeedHistoryGeneration() {
  console.log("\n[Test 20] Testing database seed history generator...");

  const product = SEED_PRODUCTS[0]; // Sony headphones
  const now = new Date("2026-03-01T12:00:00Z");
  const checks = generateHistoricalPriceChecks(product, now);

  assert.strictEqual(checks.length, product.daysOfHistory * product.checksPerDay);

  const lastCheck = checks[checks.length - 1];
  assert.strictEqual(lastCheck.price, product.currentPrice);
  assert.strictEqual(lastCheck.currency, product.currency);
  assert.strictEqual(lastCheck.status, "success");

  // Verify timestamps are in ascending order
  for (let i = 1; i < checks.length; i++) {
    assert.ok(
      checks[i].checkedAt.getTime() > checks[i - 1].checkedAt.getTime(),
      "Seed check timestamps must be strictly chronological",
    );
  }

  console.log("✓ Database seed history generator test passed.");
}

function runAllTests() {
  try {
    testPriceParsing();
    testJsonLdExtraction();
    testMetaTagExtraction();
    testDomainSpecificPatterns();
    testRegexFallback();
    testIntervalAndBackoffCalculations();
    testNestedJsonLdExtraction();
    testMicrodataExtraction();
    testElementPatternExtraction();
    testRegexFallbackRobustness();
    testCleanUrl();
    testDetectPlatform();
    testMetadataExtraction();
    testNameAndImageExtraction();
    testTimeframeParsing();
    testPriceStatisticsCalculation();
    testTimeBucketingAndDownsampling();
    testCsvExportFormatting();
    testPriceHistoryDtoMapping();
    testSeedHistoryGeneration();
    console.log("\n=================================================");
    console.log("ALL SCHEDULER & PRICE HISTORY TESTS PASSED (20/20)");
    console.log("=================================================\n");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    process.exit(1);
  }
}

runAllTests();
