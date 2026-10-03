import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCsvDate, parseInvoiceCsv } from "@/lib/domain/csv";

const messy = readFileSync(fileURLToPath(new URL("./fixtures/messy-invoices.csv", import.meta.url)), "utf8");

describe("parseCsvDate", () => {
  it.each([
    ["2026-09-01", "2026-09-01"],
    ["2026-09-01T10:30:00Z", "2026-09-01"],
    ["2026/09/01", "2026-09-01"],
    ["09/05/2026", "2026-09-05"],
    ["9/5/2026", "2026-09-05"],
    ["12/31/2026", "2026-12-31"],
    [" 2026-09-01 ", "2026-09-01"],
  ])("parses %s", (input, expected) => {
    expect(parseCsvDate(input)).toEqual({ ok: true, date: expected });
  });

  it("rejects day-first dates with an explanatory message", () => {
    const result = parseCsvDate("25/09/2026");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/MM\/DD\/YYYY/);
  });

  it.each(["2026-02-30", "02/30/2026", "9/5/26", "Sept 5 2026", "", "2026-9-5"])("rejects %s", (input) => {
    expect(parseCsvDate(input).ok).toBe(false);
  });
});

describe("parseInvoiceCsv", () => {
  it("parses a clean file with canonical headers", () => {
    const csv = [
      "number,customer,email,amount,currency,issued,due",
      "INV-1,Acme,ap@acme.com,100.00,USD,2026-09-01,2026-10-01",
    ].join("\n");
    expect(parseInvoiceCsv(csv)).toEqual({
      rows: [
        {
          line: 2,
          number: "INV-1",
          customerName: "Acme",
          email: "ap@acme.com",
          amountCents: 10000,
          currency: "USD",
          issuedAt: "2026-09-01",
          dueAt: "2026-10-01",
        },
      ],
      errors: [],
    });
  });

  it.each([
    "Invoice #,Client,Email,Total,Currency,Issue Date,Due Date",
    "invoice_number,customer,email,amount,currency,issued,due_date",
    "INVOICE NUMBER,CLIENT,EMAIL,TOTAL,CURRENCY,ISSUED,DUE",
  ])("accepts header aliases: %s", (header) => {
    const result = parseInvoiceCsv(`${header}\nINV-1,Acme,ap@acme.com,5,USD,2026-09-01,2026-10-01\n`);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ number: "INV-1", customerName: "Acme", amountCents: 500 });
  });

  it("defaults currency to USD when the column is missing", () => {
    const result = parseInvoiceCsv("number,customer,email,amount,issued,due\nINV-1,A,a@b.co,5,2026-09-01,2026-10-01");
    expect(result.rows[0].currency).toBe("USD");
  });

  it("reports missing required columns on line 1 and returns no rows", () => {
    const result = parseInvoiceCsv("number,customer,amount\nINV-1,A,5");
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(1);
    expect(result.errors[0].message).toMatch(/email/);
    expect(result.errors[0].message).toMatch(/issued/i);
    expect(result.errors[0].message).toMatch(/due/i);
  });

  it("reports an empty file", () => {
    expect(parseInvoiceCsv("   \n")).toEqual({ rows: [], errors: [{ line: 1, message: expect.stringMatching(/empty/i) }] });
  });

  it("auto-detects semicolon-delimited European exports", () => {
    const csv = "Invoice #;Customer;Email;Amount;Currency;Issued;Due\nF-7;Müller GmbH;rechnung@mueller.de;1.234,50;EUR;2026-09-01;2026-10-01";
    const result = parseInvoiceCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ customerName: "Müller GmbH", amountCents: 123450, currency: "EUR" });
  });

  describe("messy fixture", () => {
    const result = parseInvoiceCsv(messy);

    it("keeps the valid rows with record-based line numbers", () => {
      expect(result.rows.map((r) => [r.line, r.number])).toEqual([
        [2, "INV-001"],
        [3, "INV-002"],
        [10, "INV-007"],
        [13, "INV-010"],
      ]);
    });

    it("normalises values", () => {
      const [first, second, multiline, euro] = result.rows;
      expect(first).toMatchObject({ amountCents: 123450, currency: "USD", email: "ap@acme.com" });
      expect(second).toMatchObject({
        customerName: "Smith, Jones & Co",
        amountCents: 98000,
        issuedAt: "2026-09-05",
        dueAt: "2026-10-05",
        currency: "USD",
      });
      expect(multiline).toMatchObject({ customerName: "Multi line Ltd", amountCents: 123450, currency: "EUR" });
      expect(euro).toMatchObject({ amountCents: 9900, currency: "EUR" });
    });

    it("reports each bad row with its line and reason, skipping blank rows silently", () => {
      const byLine = new Map<number, string[]>();
      for (const e of result.errors) byLine.set(e.line, [...(byLine.get(e.line) ?? []), e.message]);
      expect([...byLine.keys()].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 11, 12, 14]);
      expect(byLine.get(5)?.join()).toMatch(/email/i);
      expect(byLine.get(6)?.join()).toMatch(/MM\/DD\/YYYY/);
      expect(byLine.get(7)?.join()).toMatch(/greater than zero/i);
      expect(byLine.get(8)?.join()).toMatch(/duplicate.*line 2/i);
      expect(byLine.get(9)?.join()).toMatch(/before/i);
      expect(byLine.get(11)?.join()).toMatch(/issued/i);
      expect(byLine.get(12)?.join()).toMatch(/amount/i);
      expect(byLine.get(14)?.join()).toMatch(/currency/i);
    });
  });
});
