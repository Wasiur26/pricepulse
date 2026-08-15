import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
];

const CURRENCY_SYMBOLS = "$£€¥₹₩₪฿₫₦₽₺₱";
const NUMBER_PATTERN = "(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{1,7})(?:[.,]\\d{1,2})?";

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function parsePriceNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 0 ? Math.round(raw * 100) / 100 : null;
  }
  if (raw == null || typeof raw !== "string") return null;

  const cleaned = raw.replace(/[^0-9.,]/g, "").trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
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

function currencyFromSymbol(symbol: string): string {
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
    case "₽":
      return "RUB";
    case "₺":
      return "TRY";
    default:
      return "USD";
  }
}

function findCurrency(html: string): string {
  const match =
    html.match(/<meta\b[^>]*itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*itemprop=["']priceCurrency["']/i) ||
    html.match(/<meta\b[^>]*(?:property|name)=["'](?:product:price:currency|og:price:currency)["'][^>]*content=["']([^"']+)["']/i);
  if (match && match[1] && /^[A-Za-z]{3}$/.test(match[1].trim())) {
    return match[1].trim().toUpperCase();
  }
  return "USD";
}

type JsonLdValue = null | boolean | number | string | JsonLdValue[] | JsonLdObject;
type JsonLdObject = { [key: string]: JsonLdValue };

function asPriceValue(v: JsonLdValue): string | number | null {
  return typeof v === "string" || typeof v === "number" ? v : null;
}

function findPriceInJsonLdNode(node: JsonLdValue): { price: number; currency: string } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = findPriceInJsonLdNode(child);
      if (result) return result;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const obj = node as JsonLdObject;

  if (obj.offers != null && typeof obj.offers === "object") {
    const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
    for (const offer of offers) {
      if (!offer || typeof offer !== "object") continue;
      const o = offer as JsonLdObject;

      let priceValue = o.price;
      if (priceValue == null && o.lowPrice != null) priceValue = o.lowPrice;
      if (priceValue == null && o.highPrice != null) priceValue = o.highPrice;

      if (priceValue == null && o.priceSpecification != null && typeof o.priceSpecification === "object") {
        const specs = Array.isArray(o.priceSpecification) ? o.priceSpecification : [o.priceSpecification];
        const spec = specs.find((s) => s && typeof s === "object" && (s as JsonLdObject).price != null) as JsonLdObject | undefined;
        if (spec) priceValue = spec.price;
      }

      const parsedPrice = parsePriceNumber(asPriceValue(priceValue));
      if (parsedPrice != null) {
        let currency = typeof o.priceCurrency === "string" ? o.priceCurrency : undefined;
        if (!currency && o.priceSpecification && typeof o.priceSpecification === "object") {
          const specs = Array.isArray(o.priceSpecification) ? o.priceSpecification : [o.priceSpecification];
          const spec = specs.find((s) => s && typeof s === "object" && typeof (s as JsonLdObject).priceCurrency === "string") as JsonLdObject | undefined;
          if (spec) currency = typeof spec.priceCurrency === "string" ? spec.priceCurrency : undefined;
        }
        return { price: parsedPrice, currency: currency ? currency.toUpperCase() : "USD" };
      }
    }
  }

  const ownPrice = obj.price ?? obj.lowPrice ?? obj.highPrice;
  if (ownPrice != null || obj.priceCurrency != null || obj.priceSpecification != null) {
    let value = ownPrice;
    if (value == null && obj.priceSpecification && typeof obj.priceSpecification === "object") {
      const specs = Array.isArray(obj.priceSpecification) ? obj.priceSpecification : [obj.priceSpecification];
      const spec = specs.find((s) => s && typeof s === "object" && (s as JsonLdObject).price != null) as JsonLdObject | undefined;
      if (spec) value = spec.price;
    }
    const parsedPrice = parsePriceNumber(asPriceValue(value));
    if (parsedPrice != null) {
      return { price: parsedPrice, currency: typeof obj.priceCurrency === "string" ? obj.priceCurrency.toUpperCase() : "USD" };
    }
  }

  for (const key of Object.keys(obj)) {
    if (key === "@context") continue;
    const child = obj[key];
    if (child && typeof child === "object") {
      const result = findPriceInJsonLdNode(child);
      if (result) return result;
    }
  }

  return null;
}

function extractPriceFromText(text: string): number | null {
  const trimmed = (text || "").replace(/\s+/g, " ").trim();
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

function extractPriceFromRegex(text: string): { price: number; currency: string } | null {
  const priceContextRe = /\b(price|our price|sale price|regular price|current price|list price|rrp|sale|clearance|subtotal)\b/i;
  const currentPriceRe = /\b(now|special|sale price|current price|our price|sale|deal|clearance|discounted)\b/gi;
  const anchorPriceRe = /\b(was|compare at|original price)\b/gi;
  const codes = "USD|EUR|GBP|CAD|AUD|NZD|HKD|SGD|JPY|CNY|INR|MXN|CHF|SEK|NOK|DKK|PLN|BRL|KRW|ZAR";
  const tokenRe = new RegExp(
    `([${CURRENCY_SYMBOLS}])\\s*(${NUMBER_PATTERN})\\s*(\\b(?:${codes})\\b)?` +
      `|(${NUMBER_PATTERN})\\s*([${CURRENCY_SYMBOLS}])?\\s*(\\b(?:${codes})\\b)?` +
      `|(\\b(?:${codes})\\b)\\s*(${NUMBER_PATTERN})\\s*([${CURRENCY_SYMBOLS}])?`,
    "gi",
  );

  const candidates = new Map<string, { value: number; count: number; score: number; index: number; symbol: string | null; code: string | null }>();

  const addCandidate = (numStr: string, symbol: string | null, code: string | null, index: number) => {
    if (!numStr) return;
    const value = parsePriceNumber(numStr);
    if (value == null || value > 100000000) return;

    const decimals = (numStr.match(/[.,](\d{1,2})$/) || [])[1]?.length ?? 0;
    const contextStart = Math.max(0, index - 120);
    const context = text.slice(contextStart, index + 120);
    const tokenPosInContext = index - contextStart;
    const inPriceContext = priceContextRe.test(context);

    if (!symbol && !code && decimals !== 2 && !/[.,]\d{3}/.test(numStr) && !inPriceContext) {
      return;
    }

    let score = 0;
    if (symbol) score += 4;
    if (code) score += 3;
    if (value >= 0.5 && value <= 100000) score += 2;
    else score -= 3;
    if (decimals === 2) score += 1;
    if (inPriceContext) score += 3;

    const near = (re: RegExp): number => {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      let best = 0;
      while ((m = re.exec(context)) !== null) {
        const dist = Math.abs(m.index - tokenPosInContext);
        if (dist <= 40) {
          best = Math.max(best, dist <= 6 ? 4 : 2);
        }
      }
      return best;
    };
    score += near(currentPriceRe);
    score -= near(anchorPriceRe);

    const key = value.toFixed(2);
    const existing = candidates.get(key);
    if (existing) {
      existing.count += 1;
      existing.score = Math.max(existing.score, score);
    } else {
      candidates.set(key, { value, count: 1, score, index, symbol, code });
    }
  };

  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text)) !== null) {
    addCandidate(match[2] || match[4] || match[8] || "", match[1] || match[5] || match[9] || null, match[3] || match[6] || match[7] || null, match.index);
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

function findJsonLdPrice($: cheerio.CheerioAPI): { price: number; currency: string } | null {
  let result: { price: number; currency: string } | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return false;
    try {
      const json = JSON.parse($(el).html() || "{}");
      const r = findPriceInJsonLdNode(json);
      if (r) result = r;
    } catch {
      // ignore malformed JSON
    }
  });
  return result;
}

function extractPrice(html: string): { price: number; currency: string; strategy: string } | null {
  const $ = cheerio.load(html);

  // 1. JSON-LD (recursive; handles @graph, mainEntity, priceSpecification arrays, bare Offers)
  const jsonLdResult = findJsonLdPrice($);
  if (jsonLdResult) {
    return { price: jsonLdResult.price, currency: jsonLdResult.currency, strategy: "json-ld" };
  }

  // 2. OpenGraph / product / Twitter meta tags
  const metaSelectors =
    'meta[property="og:price:amount"], meta[property="product:price:amount"], meta[property="og:price:standard_amount"], meta[property="product:price"], meta[property="og:price"], meta[name="twitter:data1"], meta[itemprop="price"]';
  const metaEl = $(metaSelectors).first();
  if (metaEl.length > 0) {
    const raw = metaEl.attr("content");
    const price = parsePriceNumber(raw);
    if (price != null) {
      return { price, currency: findCurrency(html), strategy: "meta-tags" };
    }
  }

  // 3. Schema.org microdata on any element
  const microdataEl = $('[itemprop="price"]').first();
  if (microdataEl.length > 0) {
    const raw = microdataEl.attr("content") || microdataEl.text();
    const price = parsePriceNumber(raw);
    if (price != null) {
      return { price, currency: findCurrency(html), strategy: "microdata" };
    }
  }

  // 4. Elements whose class/id names a price container
  const priceSelectors =
    '[class*="price"], [class*="amount"], [class*="sale"], [class*="total"], [class*="cost"], [class*="pay"], [class*="deal"], [class*="offer"], [id*="price"], [id*="amount"]';
  const elementCandidates: { price: number; score: number }[] = [];
  $(priceSelectors).each((_, el) => {
    const attrs = $(el).attr("class") || $(el).attr("id") || "";
    if (attrs.length > 120) return;
    const text = $(el).text();
    if (!text || text.length > 500) return;
    const parsedPrice = extractPriceFromText(text);
    if (parsedPrice == null) return;

    let score = 0;
    if (/\bprice\b/i.test(attrs)) score += 5;
    if (/sale|deal|offer|discount|current|final|savings/i.test(attrs)) score += 3;
    if (/amount|total|cost|pay|retail/i.test(attrs)) score += 1;
    elementCandidates.push({ price: parsedPrice, score });
  });
  if (elementCandidates.length > 0) {
    elementCandidates.sort((a, b) => b.score - a.score);
    return { price: elementCandidates[0].price, currency: findCurrency(html), strategy: "element-pattern" };
  }

  // 5. Scored regex fallback over the visible text
  const visibleText = $("body").text().replace(/\s+/g, " ");
  const regexResult = extractPriceFromRegex(visibleText);
  if (regexResult) {
    return { ...regexResult, strategy: "regex-fallback" };
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": getRandomUserAgent(),
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      if (!response.ok) {
        return NextResponse.json({ error: `Failed to fetch the URL (HTTP ${response.status})` }, { status: 502 });
      }

      const html = await response.text();
      const result = extractPrice(html);

      if (!result) {
        return NextResponse.json({ error: "Price not found in metadata" }, { status: 404 });
      }

      return NextResponse.json(result);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return NextResponse.json({ error: "Failed to fetch the URL" }, { status: 500 });
  }
}
