const assert = require("assert");
const {
  extractPriceFromHtml,
  parsePriceNumber,
} = require("./priceChecker");
const {
  CHECK_INTERVAL_MS,
  RETRY_INITIAL_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} = require("./constants");
const { calculateRetryDelay } = require("./priceScheduler");

console.log("=================================================");
console.log("RUNNING HIGH-FREQUENCY SCHEDULER UNIT TESTS");
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
    console.log("\n=================================================");
    console.log("ALL SCHEDULER & PRICE-CHECK TESTS PASSED (10/10)");
    console.log("=================================================\n");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    process.exit(1);
  }
}

runAllTests();
