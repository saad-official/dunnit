import { describe, expect, it } from "vitest";
import {
  addCents,
  formatCents,
  parseAmountToCents,
  percentOf,
  ratioToPercent,
} from "@/lib/domain/money";

describe("formatCents", () => {
  it("formats USD cents in en-US by default", () => {
    expect(formatCents(123450, "USD")).toBe("$1,234.50");
  });

  it("formats negative amounts", () => {
    expect(formatCents(-500, "USD")).toBe("-$5.00");
  });

  it("respects locale", () => {
    expect(formatCents(123450, "EUR", "de-DE").replace(/\s/g, " ")).toBe("1.234,50 €");
  });

  it("treats zero-decimal currencies (JPY) as whole units", () => {
    expect(formatCents(1500, "JPY")).toBe("¥1,500");
  });

  it("rejects non-integer cents", () => {
    expect(() => formatCents(10.5, "USD")).toThrow(RangeError);
  });
});

describe("parseAmountToCents", () => {
  it.each([
    ["$1,234.50", 123450],
    ["1234", 123400],
    ["1234.5", 123450],
    ["1.234,50", 123450],
    ["1 234,50 €", 123450],
    ["€1.234.567,89", 123456789],
    ["1,234,567", 123456700],
    ["1,234", 123400],
    ["1.234", 123400],
    ["12,5", 1250],
    ["0.99", 99],
    [".50", 50],
    ["USD 2,000.00", 200000],
    ["  42  ", 4200],
    ["-15.00", -1500],
    ["(15.00)", -1500],
    ["1'234.50", 123450],
  ])("parses %s as %i cents", (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it.each([
    [""],
    ["abc"],
    ["1.2.3,4,5"],
    ["0.125"],
    ["12.345.67"],
    ["1,23,456"],
    ["1.234,567"],
    ["$"],
    ["99999999999999999999"],
  ])("returns null for %s", (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });
});

describe("addCents", () => {
  it("sums integer cents", () => {
    expect(addCents(100, 250, -50)).toBe(300);
    expect(addCents()).toBe(0);
  });

  it("rejects fractional cents", () => {
    expect(() => addCents(1, 0.5)).toThrow(RangeError);
  });
});

describe("percent helpers", () => {
  it("percentOf rounds half away from zero to whole cents", () => {
    expect(percentOf(10000, 1.5)).toBe(150);
    expect(percentOf(333, 50)).toBe(167);
    expect(percentOf(-333, 50)).toBe(-167);
  });

  it("ratioToPercent returns null for a zero whole", () => {
    expect(ratioToPercent(1, 4)).toBe(25);
    expect(ratioToPercent(1, 3, 1)).toBe(33.3);
    expect(ratioToPercent(5, 0)).toBeNull();
  });
});
