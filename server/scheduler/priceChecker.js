const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function parsePriceNumber(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 0 ? raw : null;
  }
  if (!raw || typeof raw !== "string") return null;

  // Clean currency symbols and commas: "$ 1,299.99" -> "1299.99"
  const cleaned = raw.replace(/[^0-9.,]/g, "").trim();
  if (!cleaned) return null;

  // Handle format like "1.299,99" (European) vs "1,299.99" (US)
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      // European format (e.g. 1.299,99)
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // US format (e.g. 1,299.99)
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    // If only comma exists: check if comma is decimal (e.g. 29,99) or thousands (e.g. 1,000)
    const parts = cleaned.split(",");
    if (parts[parts.length - 1].length === 2) {
      normalized = cleaned.replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  }

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/**
 * Strategy 1: Extract price from Schema.org JSON-LD microdata (<script type="application/ld+json">)
 */
function extractPriceFromJsonLd(html) {
  const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const objects = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"] && Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];

      for (const obj of objects) {
        if (!obj) continue;
        const type = obj["@type"];
        const isProduct =
          type === "Product" ||
          (Array.isArray(type) && type.includes("Product")) ||
          type === "IndividualProduct";

        if (isProduct && obj.offers) {
          const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
          for (const offer of offers) {
            const price =
              offer.price ||
              offer.lowPrice ||
              offer.highPrice ||
              (offer.priceSpecification && offer.priceSpecification.price);
            const parsedPrice = parsePriceNumber(String(price));
            if (parsedPrice != null) {
              const currency =
                offer.priceCurrency ||
                (offer.priceSpecification && offer.priceSpecification.priceCurrency) ||
                "USD";
              return { price: parsedPrice, currency: String(currency).toUpperCase() };
            }
          }
        }
      }
    } catch {
      // Continue to next script if JSON is malformed
    }
  }
  return null;
}

/**
 * Strategy 2: Extract price from OpenGraph and standard Meta tags
 */
function extractPriceFromMetaTags(html) {
  const metaTagPatterns = [
    /<meta\s+[^>]*property=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["']([^"']+)["']/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["'](?:product:price:amount|og:price:amount)["']/i,
    /<meta\s+[^>]*itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*itemprop=["']price["']/i,
    /<meta\s+[^>]*name=["']twitter:data1["'][^>]*content=["']([^"']+)["']/i,
  ];

  for (const pattern of metaTagPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const price = parsePriceNumber(match[1]);
      if (price != null) {
        // Attempt to extract currency
        const currencyMatch =
          html.match(/<meta\s+[^>]*property=["'](?:product:price:currency|og:price:currency)["'][^>]*content=["']([^"']+)["']/i) ||
          html.match(/<meta\s+[^>]*itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i);
        const currency = currencyMatch ? currencyMatch[1].trim().toUpperCase() : "USD";
        return { price, currency };
      }
    }
  }
  return null;
}

/**
 * Strategy 3: Domain-specific patterns for major retailers
 */
function extractPriceByDomain(html, url) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  // Amazon
  if (hostname.includes("amazon.")) {
    const amazonPatterns = [
      /<span class=["'][^"']*a-offscreen[^"']*["']>\s*([$£€]?\s*\d{1,5}(?:,\d{3})*(?:\.\d{2})?)\s*<\/span>/i,
      /<span id=["']priceblock_ourprice["'][^>]*>\s*([$£€]?\s*\d{1,5}(?:,\d{3})*(?:\.\d{2})?)\s*<\/span>/i,
      /<span id=["']priceblock_dealprice["'][^>]*>\s*([$£€]?\s*\d{1,5}(?:,\d{3})*(?:\.\d{2})?)\s*<\/span>/i,
      /<span class=["']a-price-whole["']>(\d+(?:,\d+)*)<\/span><span class=["']a-price-fraction["']>(\d{2})<\/span>/i,
    ];

    for (const pattern of amazonPatterns) {
      const match = html.match(pattern);
      if (match) {
        if (match[2] && pattern.toString().includes("a-price-fraction")) {
          const whole = match[1].replace(/,/g, "");
          const fraction = match[2];
          const price = Number.parseFloat(`${whole}.${fraction}`);
          if (Number.isFinite(price) && price > 0) return { price, currency: "USD" };
        } else if (match[1]) {
          const price = parsePriceNumber(match[1]);
          if (price != null) return { price, currency: "USD" };
        }
      }
    }
  }

  // eBay
  if (hostname.includes("ebay.")) {
    const ebayPatterns = [
      /<div class=["'][^"']*x-price-primary[^"']*["'][^>]*>[\s\S]*?<span class=["']ux-textspans["']>([^<]+)<\/span>/i,
      /<span id=["']prcIsum["'][^>]*content=["']([^"']+)["']/i,
      /<span class=["']x-bin-price[^"']*["']>[\s\S]*?<span class=["']ux-textspans["']>([^<]+)<\/span>/i,
    ];
    for (const pattern of ebayPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const price = parsePriceNumber(match[1]);
        if (price != null) return { price, currency: "USD" };
      }
    }
  }

  // Walmart
  if (hostname.includes("walmart.")) {
    const walmartMatch = html.match(/<span itemprop=["']price["'][^>]*>([^<]+)<\/span>/i);
    if (walmartMatch && walmartMatch[1]) {
      const price = parsePriceNumber(walmartMatch[1]);
      if (price != null) return { price, currency: "USD" };
    }
  }

  // BestBuy
  if (hostname.includes("bestbuy.")) {
    const bestbuyMatch = html.match(/<div class=["']priceView-hero-price priceView-customer-price["']>[\s\S]*?<span aria-hidden=["']true["']>([^<]+)<\/span>/i);
    if (bestbuyMatch && bestbuyMatch[1]) {
      const price = parsePriceNumber(bestbuyMatch[1]);
      if (price != null) return { price, currency: "USD" };
    }
  }

  return null;
}

/**
 * Strategy 4: Fallback context-aware regex price search
 */
function extractPriceByRegex(html) {
  if (!html) return null;

  // Search for currency-prefixed or postfixed price
  const patterns = [
    /(?:price|our price|sale price|current price|now|special price|price:)\s*(?:<\/?[a-z0-9]+[^>]*>|\s)*\s*(?:\$|USD\s*|£|€)\s*(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)/i,
    /(?:\$|USD\s*)(\d{1,4}(?:,\d{3})*(?:\.\d{2}))(?!\d)/i,
    /(\d{1,4}(?:,\d{3})*(?:\.\d{2}))\s*(?:USD|\$)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const price = parsePriceNumber(match[1]);
      if (price != null) {
        return { price, currency: "USD" };
      }
    }
  }
  return null;
}

/**
 * Execute extraction pipeline across all strategies
 */
function extractPriceFromHtml(html, url) {
  // Strategy 1: JSON-LD Structured Data
  const jsonLdResult = extractPriceFromJsonLd(html);
  if (jsonLdResult) {
    return { ...jsonLdResult, strategy: "json-ld" };
  }

  // Strategy 2: OpenGraph / Microdata Meta tags
  const metaResult = extractPriceFromMetaTags(html);
  if (metaResult) {
    return { ...metaResult, strategy: "meta-tags" };
  }

  // Strategy 3: Domain-specific selector patterns
  const domainResult = extractPriceByDomain(html, url);
  if (domainResult) {
    return { ...domainResult, strategy: "domain-pattern" };
  }

  // Strategy 4: Regex fallback
  const regexResult = extractPriceByRegex(html);
  if (regexResult) {
    return { ...regexResult, strategy: "regex-fallback" };
  }

  return null;
}

/**
 * Main price-checker query executor
 */
async function runPriceCheck(trackedItem) {
  const timeoutMs = Number.parseInt(process.env.SCRAPER_TIMEOUT_MS || "15000", 10);
  const startedAt = Date.now();

  try {
    let targetUrl = trackedItem.url;

    // Optional proxy/scraping service integration (placeholder for ScrapingBee / BrightData / ScraperAPI)
    const scraperProxyUrl = process.env.SCRAPER_PROXY_URL;
    const scraperApiKey = process.env.SCRAPER_API_KEY;

    if (scraperProxyUrl && scraperApiKey) {
      targetUrl = `${scraperProxyUrl}?api_key=${encodeURIComponent(scraperApiKey)}&url=${encodeURIComponent(trackedItem.url)}`;
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    const responseMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        status: "error",
        price: null,
        currency: trackedItem.currency || "USD",
        responseMs,
        errorMessage: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();
    const extraction = extractPriceFromHtml(html, trackedItem.url);

    if (!extraction || extraction.price == null) {
      return {
        status: "skipped",
        price: null,
        currency: trackedItem.currency || "USD",
        responseMs,
        errorMessage: "Price could not be extracted from page content",
      };
    }

    return {
      status: "success",
      price: extraction.price,
      currency: extraction.currency || trackedItem.currency || "USD",
      responseMs,
      errorMessage: null,
      strategy: extraction.strategy,
    };
  } catch (error) {
    const responseMs = Date.now() - startedAt;
    const isTimeout = error.name === "TimeoutError" || error.name === "AbortError";

    return {
      status: "error",
      price: null,
      currency: trackedItem.currency || "USD",
      responseMs,
      errorMessage: isTimeout ? `Request timed out after ${timeoutMs}ms` : error.message,
    };
  }
}

module.exports = {
  runPriceCheck,
  extractPriceFromHtml,
  parsePriceNumber,
};
