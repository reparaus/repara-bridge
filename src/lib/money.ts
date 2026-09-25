export function formatCents(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

/** "$1,234.50" / "1234" → cents; empty → 0; invalid → null. */
export function parseDollars(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, "");
  if (!clean) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
