const PLATFORM_LABELS: Record<string, string> = {
  amazon: "Amazon",
  ebay: "eBay",
  walmart: "Walmart",
  bestbuy: "Best Buy",
  target: "Target",
  etsy: "Etsy",
  newegg: "Newegg",
  aliexpress: "AliExpress",
  alibaba: "Alibaba",
  shopify: "Shopify",
  homedepot: "Home Depot",
  lowes: "Lowe's",
  costco: "Costco",
  ikea: "IKEA",
  nike: "Nike",
  adidas: "Adidas",
  apple: "Apple",
  harborfreight: "Harbor Freight",
  overstock: "Overstock",
  wayfair: "Wayfair",
  zappos: "Zappos",
};

export function platformLabel(platform: string | null): string | null {
  if (!platform) return null;
  return PLATFORM_LABELS[platform] || platform;
}
