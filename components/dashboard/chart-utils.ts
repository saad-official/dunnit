/** Small helpers shared by the hand-rolled dashboard charts. */

/** Rounds a maximum up to 1, 2, 2.5 or 5 × 10^n so axis ticks land on round numbers. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * base) return step * base;
  }
  return 10 * base;
}

/** "2026-09-28" → "Sep 28" (the date is a calendar day, so format it in UTC). */
export function weekLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Long form for tooltips and the data table: "Week of Sep 28, 2026". */
export function weekLabelLong(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return `Week of ${date}`;
}

/** Axis-friendly money: "$1.2K". Minor units are converted with the currency's own decimals. */
export function compactMoney(cents: number, currency: string): string {
  const digits = new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 10 ** digits);
}

/** Which x labels to print: every third week, always including the current one. */
export function showTick(index: number, count: number): boolean {
  return (count - 1 - index) % 3 === 0;
}
