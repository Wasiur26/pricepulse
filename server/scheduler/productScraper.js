const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

const CURRENCY_SYMBOLS = "$£€¥₹₩₪฿₫₦₽₺₱";
const CURRENCY_CODES =
  "USD|EUR|GBP|CAD|AUD|NZD|HKD|SGD|JPY|CNY|INR|MXN|CHF|SEK|NOK|DKK|PLN|BRL|KRW|ZAR|AED|PHP|THB|RUB|TRY|IDR|MYR|ILS|CLP|PEN|UYU";
const NUMBER_PATTERN = "(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{1,7})(?:[.,]\\d{1,2})?";

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePriceNumber(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 0 ? Math.round(raw * 100) / 100 : null;
  }
  if (raw == null || typeof raw !== "string") return null;

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

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&euro;/gi, "€")
    .replace(/&pound;/gi, "£")
    .replace(/&dollar;/gi, "$")
    .replace(/&yen;/gi, "¥")
    .replace(/&#36;/gi, "$")
    .replace(/&#163;/gi, "£")
    .replace(/&#8364;/gi, "€")
    .replace(/&#165;/gi, "¥")
    .replace(/&#x24;/gi, "$")
    .replace(/&#xA3;/gi, "£")
    .replace(/&#x20AC;/gi, "€")
    .replace(/&#x165;/gi, "¥");
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function getAttributeValue(tag, attrName) {
  const match = String(tag).match(new RegExp(attrName + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"));
  return match ? match[1].trim() : null;
}

function currencyFromSymbol(symbol) {
  switch (symbol) {
    case "$":
      return "USD";
    case "€":
      return "EUR";
    case "£":
      return "GBP";
    case "¥":
      return "JPY";
    case "₹":
      return "INR";
    case "₩":
      return "KRW";
    case "฿":
      return "THB";
    case "₽":
      return "RUB";
    case "₺":
      return "TRY";
    case "₫":
      return "VND";
    case "₦":
      return "NGN";
    case "₪":
      return "ILS";
    default:
      return "USD";
  }
}

function findCurrencyInHtml(html) {
  const patterns = [
    /<meta\b[^>]*itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*itemprop=["']priceCurrency["']/i,
    /<meta\b[^>]*(?:property|name)=["'](?:product:price:currency|og:price:currency)["'][^>]*content=["']([^"']+)["']/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:product:price:currency|og:price:currency)["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1] && /^[A-Za-z]{3}$/.test(match[1].trim())) {
      return match[1].trim().toUpperCase();
    }
  }
  return "USD";
}

/**
 * Strategy 1: Extract price from Schema.org JSON-LD microdata (<script type="application/ld+json">)
 * Traverses the full document tree so nested @graph / mainEntity / ItemList / bare Offer structures work.
 */
function findPriceInJsonLdNode(node) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = findPriceInJsonLdNode(child);
      if (result) return result;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;

  // Product-style node with an `offers` list
  if (node.offers != null) {
    const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
    for (const offer of offers) {
      if (!offer || typeof offer !== "object") continue;

      let priceValue = offer.price;
      if (priceValue == null && offer.lowPrice != null) priceValue = offer.lowPrice;
      if (priceValue == null && offer.highPrice != null) priceValue = offer.highPrice;

      // priceSpecification may be a single object or an array of UnitPriceSpecification
      if (priceValue == null && offer.priceSpecification != null) {
        const specs = Array.isArray(offer.priceSpecification)
          ? offer.priceSpecification
          : [offer.priceSpecification];
        const spec = specs.find((s) => s && typeof s === "object" && s.price != null);
        if (spec) priceValue = spec.price;
      }

      const parsedPrice = parsePriceNumber(priceValue);
      if (parsedPrice != null) {
        let currency = offer.priceCurrency;
        if (!currency && offer.priceSpecification) {
          const specs = Array.isArray(offer.priceSpecification)
            ? offer.priceSpecification
            : [offer.priceSpecification];
          const spec = specs.find((s) => s && typeof s === "object" && s.priceCurrency);
          if (spec) currency = spec.priceCurrency;
        }
        return {
          price: parsedPrice,
          currency: currency ? String(currency).toUpperCase() : "USD",
        };
      }
    }
  }

  // The node is itself an offer (bare Offer / AggregateOffer)
  const ownPrice = node.price ?? node.lowPrice ?? node.highPrice;
  if (ownPrice != null || node.priceCurrency != null || node.priceSpecification != null) {
    let value = ownPrice;
    if (value == null && node.priceSpecification) {
      const specs = Array.isArray(node.priceSpecification) ? node.priceSpecification : [node.priceSpecification];
      const spec = specs.find((s) => s && typeof s === "object" && s.price != null);
      if (spec) value = spec.price;
    }
    const parsedPrice = parsePriceNumber(value);
    if (parsedPrice != null) {
      return {
        price: parsedPrice,
        currency: node.priceCurrency ? String(node.priceCurrency).toUpperCase() : "USD",
      };
    }
  }

  // Recurse into remaining child properties
  for (const key of Object.keys(node)) {
    if (key === "@context") continue;
    const child = node[key];
    if (child && typeof child === "object") {
      const result = findPriceInJsonLdNode(child);
      if (result) return result;
    }
  }

  return null;
}

function extractPriceFromJsonLd(html) {
  if (!html) return null;
  const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json(?:;[^"']*)?["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const result = findPriceInJsonLdNode(parsed);
      if (result) return result;
    } catch {
      // Continue to next script if JSON is malformed
    }
  }
  return null;
}

/**
 * Strategy 2: Extract price from OpenGraph / product / Twitter meta tags
 */
function extractPriceFromMetaTags(html) {
  if (!html) return null;

  const priceMetaNames = /^(?:product:price:amount|og:price:amount|og:price:standard_amount|product:price|og:price|twitter:data1)$/i;
  const metaRe = /<meta\b[^>]*>/gi;
  let match;
  let price = null;

  while ((match = metaRe.exec(html)) !== null) {
    const tag = match[0];
    const name = getAttributeValue(tag, "property") || getAttributeValue(tag, "name");
    if (!name || !priceMetaNames.test(name)) continue;

    const parsedPrice = parsePriceNumber(getAttributeValue(tag, "content"));
    if (parsedPrice != null) {
      price = parsedPrice;
      break;
    }
  }

  // <meta itemprop="price" content="..."> fallback
  if (price == null) {
    const itempropRe = /<meta\b[^>]*itemprop=["']price["'][^>]*>/gi;
    while ((match = itempropRe.exec(html)) !== null) {
      const parsedPrice = parsePriceNumber(getAttributeValue(match[0], "content"));
      if (parsedPrice != null) {
        price = parsedPrice;
        break;
      }
    }
  }

  return price != null ? { price, currency: findCurrencyInHtml(html) } : null;
}

/**
 * Strategy 3: Extract price from Schema.org microdata on any element
 * e.g. <span itemprop="price">$128.00</span> or <meta itemprop="price" content="...">
 */
function extractPriceFromMicrodata(html) {
  if (!html) return null;

  const pairedRe = /<([a-z][a-z0-9]*)[^>]*\bitemprop=["']price["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = pairedRe.exec(html)) !== null) {
    const inner = match[2] || "";
    if (!inner || inner.length > 2000) continue;
    const parsedPrice = parsePriceNumber(stripTags(inner));
    if (parsedPrice != null) {
      return { price: parsedPrice, currency: findCurrencyInHtml(html) };
    }
  }

  const selfRe = /<[a-z][a-z0-9]*\b[^>]*\bitemprop=["']price["'][^>]*\/?>/gi;
  while ((match = selfRe.exec(html)) !== null) {
    const tag = match[0];
    const parsedPrice = parsePriceNumber(getAttributeValue(tag, "content") || getAttributeValue(tag, "value"));
    if (parsedPrice != null) {
      return { price: parsedPrice, currency: findCurrencyInHtml(html) };
    }
  }

  return null;
}

/**
 * Extract a clean price from a short text snippet (prefers whole-snippet prices, then currency-prefixed)
 */
function extractPriceFromText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const cleanPrice = trimmed.match(new RegExp(`^[${CURRENCY_SYMBOLS}]?\\s*(${NUMBER_PATTERN})\\s*$`));
  if (cleanPrice) {
    const parsed = parsePriceNumber(cleanPrice[1]);
    if (parsed != null) return parsed;
  }

  const currencyPrice = trimmed.match(new RegExp(`[${CURRENCY_SYMBOLS}]\\s*(${NUMBER_PATTERN})`));
  if (currencyPrice) {
    const parsed = parsePriceNumber(currencyPrice[1]);
    if (parsed != null) return parsed;
  }

  return null;
}

const PRICE_ELEMENT_KEYWORDS = /\b(price|amount|sale|total|cost|pay|deal|offer|current|final|retail|discount|savings)\b/i;

const VOID_TAGS = new Set([
  "meta",
  "link",
  "input",
  "img",
  "br",
  "hr",
  "source",
  "area",
  "base",
  "col",
  "embed",
  "track",
  "wbr",
]);

function stripScriptsAndComments(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/**
 * Strategy 4: Extract price from elements whose class/id/aria-label names a price container
 * e.g. <span class="price">$45.50</span>, <div class="product-price">49.99</div>
 */
function extractPriceFromElements(html) {
  if (!html) return null;

  const cleanHtml = stripScriptsAndComments(html);
  const openTagRe = /<([a-z][a-z0-9]*)\b([^>]*)>/gi;
  const candidates = [];
  let match;

  while ((match = openTagRe.exec(cleanHtml)) !== null) {
    const tagName = match[1].toLowerCase();
    const attrs = match[2] || "";
    if (!PRICE_ELEMENT_KEYWORDS.test(attrs)) continue;

    // Void tags carry the value in an attribute instead of element content
    if (VOID_TAGS.has(tagName)) {
      const parsedPrice = parsePriceNumber(getAttributeValue(match[0], "value") || getAttributeValue(match[0], "content"));
      if (parsedPrice != null) {
        candidates.push({ price: parsedPrice, score: 3, index: match.index });
      }
      continue;
    }

    const openEnd = match.index + match[0].length;

    // Capture up to the matching closing tag, respecting same-name nesting
    let windowEnd = -1;
    const tagRe = new RegExp(`<(/?)${tagName}(?:\\s[^>]*)?>`, "gi");
    tagRe.lastIndex = openEnd;
    let depth = 0;
    let nested;
    while ((nested = tagRe.exec(cleanHtml)) !== null) {
      if (nested[1] === "/") {
        if (depth === 0) {
          windowEnd = nested.index;
          break;
        }
        depth -= 1;
      } else {
        depth += 1;
      }
    }
    if (windowEnd < 0 || windowEnd - openEnd > 1200) continue;

    const inner = cleanHtml.slice(openEnd, windowEnd);
    if (!inner || inner.length > 1000) continue;

    const text = stripTags(inner);
    if (!text || text.length > 500) continue;

    const parsedPrice = extractPriceFromText(text);
    if (parsedPrice == null) continue;

    let score = 0;
    if (/\bprice\b/i.test(attrs)) score += 5;
    if (/sale|deal|offer|discount|current|final|savings/i.test(attrs)) score += 3;
    if (/amount|total|cost|pay|retail/i.test(attrs)) score += 1;

    candidates.push({ price: parsedPrice, score, index: match.index });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const best = candidates[0];
  return { price: best.price, currency: findCurrencyInHtml(html) };
}

/**
 * Strategy 5: Domain-specific patterns for major retailers
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
 * Strategy 6: Scored regex fallback over the visible text
 * Collects every price-like token, scores it (currency indicator, plausibility,
 * surrounding "price/sale/was" context, cents precision, frequency), then picks the best.
 */
function countDecimals(numStr) {
  const match = String(numStr).match(/[.,](\d{1,2})$/);
  return match ? match[1].length : 0;
}

function extractPriceByRegex(html) {
  if (!html) return null;

  const text = decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[^\S\n]+/g, " "),
  );

  const priceContextRe = /\b(price|our price|sale price|regular price|current price|list price|rrp|sale|clearance|subtotal)\b/i;
  const currentPriceRe = /\b(now|special|sale price|current price|our price|sale|deal|clearance|discounted)\b/gi;
  const anchorPriceRe = /\b(was|compare at|original price)\b/gi;
  const tokenRe = new RegExp(
    `([${CURRENCY_SYMBOLS}])\\s*(${NUMBER_PATTERN})\\s*(\\b(?:${CURRENCY_CODES})\\b)?` +
      `|(${NUMBER_PATTERN})\\s*([${CURRENCY_SYMBOLS}])?\\s*(\\b(?:${CURRENCY_CODES})\\b)?` +
      `|(\\b(?:${CURRENCY_CODES})\\b)\\s*(${NUMBER_PATTERN})\\s*([${CURRENCY_SYMBOLS}])?`,
    "gi",
  );

  const candidates = new Map();

  const addCandidate = (numStr, symbol, code, index) => {
    if (!numStr) return;
    const value = parsePriceNumber(numStr);
    if (value == null || value > 100000000) return;

    const hasSymbol = !!symbol;
    const hasCode = !!code;
    const decimals = countDecimals(numStr);
    const contextStart = Math.max(0, index - 120);
    const context = text.slice(contextStart, index + 120);
    const tokenPosInContext = index - contextStart;
    const inPriceContext = priceContextRe.test(context);

    // Bare numbers (no currency indicator) need extra evidence to avoid years / counts / SKUs
    if (!hasSymbol && !hasCode && decimals !== 2 && !/[.,]\d{3}/.test(numStr) && !inPriceContext) {
      return;
    }

    let score = 0;
    if (hasSymbol) score += 4;
    if (hasCode) score += 3;
    if (value >= 0.5 && value <= 100000) score += 2;
    else score -= 3;
    if (decimals === 2) score += 1;
    if (inPriceContext) score += 3;
    if (value >= 1900 && value <= 2100 && Number.isInteger(value) && !hasSymbol && !hasCode) score -= 6;

    // "was $X now $Y" -> prefer the price that follows the current-price signal
    const near = (re) => {
      re.lastIndex = 0;
      let m;
      let best = 0;
      while ((m = re.exec(context)) !== null) {
        const dist = Math.abs(m.index - tokenPosInContext);
        if (dist <= 40) {
          const weight = dist <= 6 ? 4 : 2;
          best = Math.max(best, weight);
        }
      }
      return best;
    };
    score += near(currentPriceRe) * 1;
    score -= near(anchorPriceRe) * 1;

    const key = value.toFixed(2);
    const existing = candidates.get(key);
    if (existing) {
      existing.count += 1;
      existing.score = Math.max(existing.score, score);
    } else {
      candidates.set(key, { value, count: 1, score, index, symbol, code });
    }
  };

  let match;
  while ((match = tokenRe.exec(text)) !== null) {
    addCandidate(match[2] || match[4] || match[8], match[1] || match[5] || match[9], match[3] || match[6] || match[7], match.index);
  }

  if (candidates.size === 0) return null;

  const ranked = Array.from(candidates.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.count !== a.count) return b.count - a.count;
    return a.index - b.index;
  });

  const best = ranked[0];
  const currency = best.code ? best.code.toUpperCase() : best.symbol ? currencyFromSymbol(best.symbol) : "USD";
  return { price: best.value, currency };
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

  // Strategy 2: OpenGraph / Product meta tags
  const metaResult = extractPriceFromMetaTags(html);
  if (metaResult) {
    return { ...metaResult, strategy: "meta-tags" };
  }

  // Strategy 3: Schema.org microdata on any element (itemprop="price")
  const microdataResult = extractPriceFromMicrodata(html);
  if (microdataResult) {
    return { ...microdataResult, strategy: "microdata" };
  }

  // Strategy 4: Elements named as price containers (class/id/aria-label)
  const elementResult = extractPriceFromElements(html);
  if (elementResult) {
    return { ...elementResult, strategy: "element-pattern" };
  }

  // Strategy 5: Domain-specific selector patterns
  const domainResult = extractPriceByDomain(html, url);
  if (domainResult) {
    return { ...domainResult, strategy: "domain-pattern" };
  }

  // Strategy 6: Scored regex fallback
  const regexResult = extractPriceByRegex(html);
  if (regexResult) {
    return { ...regexResult, strategy: "regex-fallback" };
  }

  return null;
}

/**
 * ============================================================================
 * METADATA EXTRACTION (Smart URL Parser)
 * Cleans the URL, identifies the platform, and extracts the product name,
 * image, and current price from a product page.
 * ============================================================================
 */

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PLATFORM_RULES = [
  ["amazon", /(^|\.)amazon\.(com|com\.au|com\.br|com\.mx|com\.tr|co\.jp|co\.uk|ca|cn|de|es|fr|in|it|mx|nl|pl|sa|se|sg|ae|eg)$/],
  ["ebay", /(^|\.)ebay\.(com|co\.uk|co\.jp|co\.kr|co\.nz|com\.au|com\.br|com\.hk|com\.my|com\.sg|ca|ch|de|es|fr|ie|it|nl|ph|pl|be|at)$/],
  ["walmart", /(^|\.)walmart\.(com|ca|com\.mx)$/],
  ["bestbuy", /(^|\.)bestbuy\.(com|ca)$/],
  ["target", /(^|\.)target\.com$/],
  ["etsy", /(^|\.)etsy\.com$/],
  ["newegg", /(^|\.)newegg\.(com|ca)$/],
  ["aliexpress", /(^|\.)aliexpress\.(com|us|ru|de|fr|it|es|pt|pl|nl|id|co|mx|tr|ar|br|il|jp|kr|th|vn|sa|ae)$/],
  ["alibaba", /(^|\.)alibaba\.(com|us|co|ae|pl|ru)$/],
  ["shopify", /myshopify\.com$/],
  ["homedepot", /(^|\.)homedepot\.com$/],
  ["lowes", /(^|\.)lowes\.com$/],
  ["costco", /(^|\.)costco\.(com|ca|co\.uk)$/],
  ["ikea", /(^|\.)ikea\.(com|ca|co\.uk|co\.jp|de|fr|es|it|nl|se|dk|no|fi|pl|at|be|ch|cz|hk|hu|ie|kr|my|pt|ro|sg|sk|th|tw|us)$/],
  ["nike", /(^|\.)nike\.(com|ca|co\.uk|de|fr|es|it|nl|jp|kr|au)$/],
  ["adidas", /(^|\.)adidas\.(com|co\.uk|de|fr|es|it|nl|ca|au|jp|kr|mx|br|sg)$/],
  ["apple", /(^|\.)apple\.com$/],
  ["harborfreight", /(^|\.)harborfreight\.com$/],
  ["overstock", /(^|\.)overstock\.com$/],
  ["wayfair", /(^|\.)wayfair\.(com|ca|co\.uk)$/],
  ["zappos", /(^|\.)zappos\.com$/],
];

/**
 * Identify the retail platform for a given URL (hostname-based).
 */
function detectPlatform(rawUrl) {
  let hostname = "";
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    try {
      hostname = new URL(`https://${rawUrl}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  for (const [name, pattern] of PLATFORM_RULES) {
    if (pattern.test(hostname)) return name;
  }
  return "other";
}

const GENERIC_TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_source_platform",
  "utm_creative_format",
  "utm_im",
  "utm_au",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "srsltid",
  "gbraid",
  "wbraid",
  "yclid",
  "twclid",
  "igshid",
  "sprefix",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "pk_campaign",
  "pk_kwd",
  "pk_medium",
  "pk_source",
  "piwik_campaign",
  "wt_mc_id",
  "wt_mc",
  "icid",
  "vero_id",
]);

const PLATFORM_TRACKING_PARAMS = {
  amazon: new Set([
    "ref",
    "ref_",
    "ref_src",
    "ref_url",
    "psc",
    "th",
    "qid",
    "sr",
    "ie",
    "pf_rd_p",
    "pf_rd_r",
    "pf_rd_s",
    "pf_rd_t",
    "pf_rd_i",
    "linkCode",
    "tag",
    "creative",
    "adgrpid",
    "keywords",
  ]),
  ebay: new Set(["_trkparms", "_trksid", "hash", "nrtc", "epid", "nid", "afepn", "campid", "mkrid", "customid"]),
  walmart: new Set(["wmlspartner", "ath", "irgwb", "sourceid", "veh", "affiliatesadid", "adid", "wlcs", "adsRedirect", "irclickid", "irgwc", "from"]),
  bestbuy: new Set(["skuId", "intl", "loc"]),
};

/**
 * Remove tracking / referral query parameters and normalize a product URL.
 * Returns null when the input cannot be parsed as a URL.
 */
function cleanUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    try {
      url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    } catch {
      return null;
    }
  }

  if (!/^https?:$/.test(url.protocol)) return null;

  const platform = detectPlatform(url.hostname);
  const platformParams = PLATFORM_TRACKING_PARAMS[platform] || new Set();

  for (const key of Array.from(url.searchParams.keys())) {
    const lowerKey = key.toLowerCase();
    if (GENERIC_TRACKING_PARAMS.has(lowerKey) || platformParams.has(lowerKey)) {
      url.searchParams.delete(key);
    }
  }

  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  return url.toString();
}

function resolveUrl(rawUrl, baseUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function isValidProductImage(rawUrl) {
  if (!rawUrl || rawUrl.startsWith("data:")) return false;
  try {
    const url = new URL(rawUrl);
    if (!/^https?:$/.test(url.protocol)) return false;
    const path = url.pathname.toLowerCase();
    if (/spacer|pixel|placeholder|blank|loader|loading|transparent|1x1|\.gif$/.test(path)) return false;
    return true;
  } catch {
    return false;
  }
}

function getMetaContent(html, propertyOrName) {
  const escaped = escapeRegExp(propertyOrName);
  const patterns = [
    new RegExp(`<meta\\b[^>]*property=["']${escaped}["'][^>]*content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta\\b[^>]*name=["']${escaped}["'][^>]*content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const value = decodeHtmlEntities(match[1]).trim();
      if (value) return value;
    }
  }
  return null;
}

function nodeTypeMatches(node, typeName) {
  const type = node["@type"];
  if (typeof type === "string") return type === typeName;
  if (Array.isArray(type)) return type.includes(typeName);
  return false;
}

function isValidProductName(value) {
  if (typeof value !== "string") return false;
  const name = value.trim();
  return name.length >= 3 && name.length <= 300;
}

/**
 * Recursively walk JSON-LD and return the first product-ish `name`.
 * With preferProduct=true only nodes typed `Product` are considered.
 */
function findNameInJsonLdNode(node, opts, depth = 0) {
  if (depth > 14) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = findNameInJsonLdNode(child, opts, depth + 1);
      if (result) return result;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;

  const isProduct = nodeTypeMatches(node, "Product");
  if (opts.preferProduct ? isProduct && isValidProductName(node.name) : isValidProductName(node.name)) {
    return node.name.trim();
  }

  for (const key of Object.keys(node)) {
    if (key === "@context") continue;
    const child = node[key];
    if (child && typeof child === "object") {
      const result = findNameInJsonLdNode(child, opts, depth + 1);
      if (result) return result;
    }
  }
  return null;
}

function extractNameFromJsonLd(html) {
  if (!html) return null;
  const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json(?:;[^"']*)?["'][^>]*>([\s\S]*?)<\/script>/gi;
  const nodes = [];
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      nodes.push(JSON.parse(match[1].trim()));
    } catch {
      // ignore malformed JSON
    }
  }

  for (const node of nodes) {
    const result = findNameInJsonLdNode(node, { preferProduct: true });
    if (result) return result;
  }
  for (const node of nodes) {
    const result = findNameInJsonLdNode(node, { preferProduct: false });
    if (result) return result;
  }
  return null;
}

function stripTitleSuffix(title, platform) {
  const separators = [" - ", " | ", " – ", " — ", " · ", " :: "];
  for (const sep of separators) {
    const index = title.lastIndexOf(sep);
    if (index <= 0) continue;
    const candidate = title.slice(0, index).trim();
    const suffix = title.slice(index + sep.length).trim();
    if (candidate.length < 3 || suffix.length > 50) continue;
    const looksLikeSiteSuffix =
      /(^|\.)(com|co|org|net|io|shop|store|online|official|marketplace)$/i.test(suffix) ||
      /^(amazon|ebay|walmart|best.?buy|target|etsy|aliexpress|alibaba|ikea|home depot|wayfair|newegg|nike|adidas|apple|official store)$/i.test(suffix) ||
      (platform && platform !== "other" && new RegExp(escapeRegExp(platform), "i").test(suffix));
    if (looksLikeSiteSuffix) return candidate;
  }
  return title;
}

/**
 * Extract a human-friendly product name from the page content.
 */
function extractProductName(html, platform = null) {
  if (!html) return null;

  const jsonLdName = extractNameFromJsonLd(html);
  if (jsonLdName) return jsonLdName;

  const metaTitle = getMetaContent(html, "og:title") || getMetaContent(html, "twitter:title");
  if (metaTitle && metaTitle.length >= 3 && metaTitle.length <= 300) return metaTitle;

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const title = decodeHtmlEntities(stripTags(titleMatch[1])).trim();
    const cleaned = stripTitleSuffix(title, platform);
    if (cleaned && cleaned.length >= 3 && cleaned.length <= 300) return cleaned;
  }

  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    const heading = decodeHtmlEntities(stripTags(h1Match[1])).trim();
    if (heading.length >= 3 && heading.length <= 300) return heading;
  }

  return null;
}

function extractImageUrlFromValue(value) {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = extractImageUrlFromValue(item);
      if (url) return url;
    }
    return null;
  }
  if (value && typeof value === "object") {
    if (typeof value.url === "string" && value.url.trim()) return value.url.trim();
    if (typeof value.contentUrl === "string" && value.contentUrl.trim()) return value.contentUrl.trim();
  }
  return null;
}

/**
 * Recursively walk JSON-LD and return the first product `image`.
 * With preferProduct=true only nodes typed `Product` are considered.
 */
function findImageInJsonLdNode(node, opts, depth = 0) {
  if (depth > 14) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = findImageInJsonLdNode(child, opts, depth + 1);
      if (result) return result;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;

  const isProduct = nodeTypeMatches(node, "Product");
  if (node.image != null && (opts.preferProduct ? isProduct : true)) {
    const imageUrl = extractImageUrlFromValue(node.image);
    if (imageUrl) return imageUrl;
  }

  for (const key of Object.keys(node)) {
    if (key === "@context") continue;
    const child = node[key];
    if (child && typeof child === "object") {
      const result = findImageInJsonLdNode(child, opts, depth + 1);
      if (result) return result;
    }
  }
  return null;
}

function extractImageFromJsonLd(html) {
  if (!html) return null;
  const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json(?:;[^"']*)?["'][^>]*>([\s\S]*?)<\/script>/gi;
  const nodes = [];
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      nodes.push(JSON.parse(match[1].trim()));
    } catch {
      // ignore malformed JSON
    }
  }

  for (const node of nodes) {
    const result = findImageInJsonLdNode(node, { preferProduct: true });
    if (result) return result;
  }
  for (const node of nodes) {
    const result = findImageInJsonLdNode(node, { preferProduct: false });
    if (result) return result;
  }
  return null;
}

/**
 * Extract a product image URL from the page, resolving relative paths.
 */
function extractProductImage(html, baseUrl) {
  if (!html) return null;
  const candidates = [];

  const jsonLdImage = extractImageFromJsonLd(html);
  if (jsonLdImage) candidates.push(jsonLdImage);

  for (const name of ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
    const value = getMetaContent(html, name);
    if (value) candidates.push(value);
  }

  const itempropImage = html.match(/<meta\b[^>]*itemprop=["']image["'][^>]*content=["']([^"']+)["']/i);
  if (itempropImage && itempropImage[1]) candidates.push(itempropImage[1]);

  const relImage = html.match(/<link\b[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i);
  if (relImage && relImage[1]) candidates.push(relImage[1]);

  const imgRe = /<img\b[^>]*>/gi;
  let match;
  while ((match = imgRe.exec(html)) !== null && candidates.length < 8) {
    const tag = match[0];
    const attrs = tag.slice(4);
    if (!/itemprop=["']image["']/i.test(attrs)) {
      const contextStart = Math.max(0, match.index - 400);
      const context = html.slice(contextStart, match.index + tag.length);
      if (!/class=["'][^"']*(product|hero|main|primary|gallery|item-image)[^"']*["']/i.test(context)) continue;
    }
    const src =
      getAttributeValue(tag, "src") ||
      getAttributeValue(tag, "data-src") ||
      getAttributeValue(tag, "data-lazy-src") ||
      getAttributeValue(tag, "content");
    if (src) candidates.push(src);
  }

  for (const raw of candidates) {
    const resolved = resolveUrl(raw, baseUrl);
    if (isValidProductImage(resolved)) return resolved;
  }
  return null;
}

/**
 * Extract the full metadata set (platform, name, image, price) from raw HTML.
 */
function extractProductMetadata(html, url) {
  const platform = detectPlatform(url);
  const priceResult = extractPriceFromHtml(html, url);
  const name = extractProductName(html, platform);
  const image = extractProductImage(html, url);

  return {
    platform,
    name,
    image,
    price: priceResult ? priceResult.price : null,
    currency: priceResult ? priceResult.currency : null,
    priceStrategy: priceResult ? priceResult.strategy : null,
  };
}

/**
 * Fetch a page with browser-like headers and a single retry on transient failures
 */
async function fetchPage(targetUrl, timeoutMs) {
  const maxAttempts = 1 + Number.parseInt(process.env.SCRAPER_MAX_RETRIES || "1", 10);
  let lastResponse = null;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(600 + attempt * 400);
    }
    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": getRandomUserAgent(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });
      if (response.ok) return response;
      lastResponse = response;
      // 429 / 5xx may be transient; 4xx page-level errors won't fix on retry
      if (response.status !== 429 && response.status < 500) return response;
    } catch (error) {
      lastError = error;
      if (error.name === "TimeoutError" || error.name === "AbortError") break;
    }
  }

  if (lastResponse) return lastResponse;
  if (lastError) throw lastError;
  return null;
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;

  if (host.includes(":")) {
    return host === "::1" || host === "::" || host.startsWith("::ffff:") || host === "[::1]" || host === "[::]";
  }

  const parts = host.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    const [a, b] = parts.map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

function isAllowedProductUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!/^https?:$/.test(url.protocol)) return false;
    if (isPrivateHost(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean, fetch, and extract full product metadata (name, image, current price,
 * platform) from a pasted product link.
 */
async function fetchProductMetadata(rawUrl) {
  const cleanedUrl = cleanUrl(rawUrl);
  if (!cleanedUrl || !isAllowedProductUrl(cleanedUrl)) {
    const error = new Error("Invalid or unsupported product URL.");
    error.code = "INVALID_URL";
    throw error;
  }

  const timeoutMs = Number.parseInt(process.env.SCRAPER_TIMEOUT_MS || "15000", 10);
  const response = await fetchPage(cleanedUrl, timeoutMs);

  if (!response) {
    const error = new Error("Failed to reach the product page.");
    error.code = "FETCH_FAILED";
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Product page returned HTTP ${response.status}.`);
    error.code = "HTTP_ERROR";
    error.status = response.status;
    throw error;
  }

  const html = await response.text();
  const finalUrl = cleanUrl(response.url) || cleanedUrl;
  const metadata = extractProductMetadata(html, finalUrl);

  return {
    url: finalUrl,
    platform: metadata.platform,
    name: metadata.name,
    image: metadata.image,
    price: metadata.price,
    currency: metadata.currency,
    priceStrategy: metadata.priceStrategy,
  };
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

    const response = await fetchPage(targetUrl, timeoutMs);
    const responseMs = Date.now() - startedAt;

    if (!response) {
      return {
        status: "error",
        price: null,
        currency: trackedItem.currency || "USD",
        responseMs,
        errorMessage: "Failed to reach the page",
      };
    }

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
  fetchProductMetadata,
  extractProductMetadata,
  extractPriceFromHtml,
  extractPriceFromJsonLd,
  extractPriceFromMetaTags,
  extractPriceFromMicrodata,
  extractPriceFromElements,
  extractPriceByDomain,
  extractPriceByRegex,
  parsePriceNumber,
  cleanUrl,
  detectPlatform,
  extractProductName,
  extractProductImage,
  extractNameFromJsonLd,
  extractImageFromJsonLd,
};
