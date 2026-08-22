export function formatPrice(
  price: number | null,
  currency: string | null,
): string {
  if (price == null) return "—";
  const code = (currency || "USD").toUpperCase();
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    INR: "₹",
    CAD: "C$",
    AUD: "A$",
    KRW: "₩",
  };
  const symbol = symbols[code];
  if (symbol) return `${symbol}${price.toFixed(2)}`;
  return `${price.toFixed(2)} ${code}`;
}
