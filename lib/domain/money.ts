/**
 * Money helpers. All amounts are integer minor units ("cents"), matching
 * Stripe's convention: zero-decimal currencies such as JPY store whole units.
 */

function assertIntegerCents(value: number, label = "cents"): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer, got ${value}`);
  }
}

export function formatCents(cents: number, currency = "USD", locale = "en-US"): string {
  assertIntegerCents(cents);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(cents / 10 ** fractionDigits);
}

const GROUPING_NOISE = /['\s  ]/g;

/**
 * Parses a human-entered amount (2 decimal currency) into integer cents.
 *
 * Decimal-separator detection, in order:
 * 1. Both "." and "," present: whichever appears LAST is the decimal separator.
 * 2. Only one kind, appearing more than once: it is a thousands separator.
 * 3. Only one kind, appearing once: followed by exactly 3 digits (and a
 *    non-zero integer part) it is a thousands separator ("1,234" / "1.234");
 *    followed by 1-2 digits it is a decimal separator; anything else is invalid.
 * Thousands groups must be 3 digits; more than 2 decimals is rejected rather
 * than rounded. Spaces, apostrophes and narrow/no-break spaces are grouping.
 * Currency symbols/codes may prefix or suffix the number. A leading "-" or
 * wrapping parentheses mean negative. Returns null when unparseable.
 */
export function parseAmountToCents(input: string): number | null {
  let text = input.trim();
  if (text === "") return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  const match = /^([^\d.,]*?)([\d.,'\s  ]*\d[\d.,'\s  ]*)([^\d.,]*)$/.exec(text);
  if (!match) return null;
  const [, prefix, rawNumber, suffix] = match;
  if (/\d/.test(prefix) || /\d/.test(suffix)) return null;
  if (prefix.includes("-")) negative = !negative;
  if (/[a-z]/i.test(prefix.replace(/[A-Z]{3}/g, "")) || /[a-z]/i.test(suffix.replace(/[A-Z]{3}/g, ""))) {
    return null;
  }

  const numeric = rawNumber.replace(GROUPING_NOISE, "");
  const lastDot = numeric.lastIndexOf(".");
  const lastComma = numeric.lastIndexOf(",");

  let decimalSep: "." | "," | null = null;
  let thousandsSep: "." | "," | null = null;

  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? "." : ",";
    thousandsSep = decimalSep === "." ? "," : ".";
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const count = numeric.split(sep).length - 1;
    if (count > 1) {
      thousandsSep = sep;
    } else {
      const [intPart, after] = numeric.split(sep);
      if (after.length === 3 && intPart !== "" && !/^0+$/.test(intPart)) {
        thousandsSep = sep;
      } else if (after.length === 1 || after.length === 2) {
        decimalSep = sep;
      } else {
        return null;
      }
    }
  }

  let intPart = numeric;
  let fracPart = "";
  if (decimalSep) {
    const pieces = numeric.split(decimalSep);
    if (pieces.length !== 2) return null;
    [intPart, fracPart] = pieces;
    if (fracPart.length < 1 || fracPart.length > 2 || !/^\d+$/.test(fracPart)) return null;
  }

  if (thousandsSep) {
    const groups = intPart.split(thousandsSep);
    if (!/^\d{1,3}$/.test(groups[0])) return null;
    if (groups.slice(1).some((g) => !/^\d{3}$/.test(g))) return null;
    intPart = groups.join("");
  }

  if (intPart === "") intPart = "0";
  if (!/^\d+$/.test(intPart)) return null;

  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(Number(intPart) * 100)) return null;
  return negative ? -cents : cents;
}

export function addCents(...values: number[]): number {
  let total = 0;
  for (const value of values) {
    assertIntegerCents(value);
    total += value;
  }
  assertIntegerCents(total, "total");
  return total;
}

/** `percent` percent of `cents`, rounded half away from zero to whole cents. */
export function percentOf(cents: number, percent: number): number {
  assertIntegerCents(cents);
  const raw = (cents * percent) / 100;
  return Math.sign(raw) * Math.round(Math.abs(raw));
}

/** part/whole as a percentage rounded to `digits` decimals; null if whole is 0. */
export function ratioToPercent(part: number, whole: number, digits = 1): number | null {
  if (whole === 0 || !Number.isFinite(part) || !Number.isFinite(whole)) return null;
  const factor = 10 ** digits;
  return Math.round((part / whole) * 100 * factor) / factor;
}
