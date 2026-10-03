/**
 * Invoice CSV import (spec 3.1).
 *
 * Line numbers are CSV record numbers with the header as line 1, i.e. the row
 * number a spreadsheet shows. A quoted field containing a newline is still one
 * record, so physical text lines can differ from these numbers.
 *
 * Date rule (explicit, no guessing):
 * - Year-first is ISO: YYYY-MM-DD (a trailing time is ignored) or YYYY/MM/DD.
 * - Slash dates with the year last are ALWAYS US month-first: M/D/YYYY or MM/DD/YYYY.
 *   If the first part cannot be a month (> 12) the row is rejected instead of
 *   silently swapping day and month. Two-digit years are rejected.
 */
import Papa from "papaparse";
import { z } from "zod";
import { isValidIsoDate } from "./dates";
import { parseAmountToCents } from "./money";
import type { IsoDate } from "./types";

export interface ValidRow {
  line: number;
  number: string;
  customerName: string;
  email: string;
  amountCents: number;
  currency: string;
  issuedAt: IsoDate;
  dueAt: IsoDate;
}

export interface CsvError {
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: ValidRow[];
  errors: CsvError[];
}

type Field = "number" | "customerName" | "email" | "amount" | "currency" | "issuedAt" | "dueAt";

/** Normalised header (lower case, alphanumerics only) -> field. */
const HEADER_ALIASES: Record<Field, readonly string[]> = {
  number: ["invoice", "invoicenumber", "invoiceno", "invoicenum", "invoiceid", "number", "inv"],
  customerName: ["customer", "customername", "client", "clientname", "company"],
  email: ["email", "emailaddress", "customeremail", "clientemail"],
  amount: ["amount", "total", "amountdue", "totalamount", "balance"],
  currency: ["currency", "curr"],
  issuedAt: ["issued", "issuedate", "issuedat", "issueddate", "invoicedate", "date"],
  dueAt: ["due", "duedate", "dueat"],
};

const REQUIRED: readonly Field[] = ["number", "customerName", "email", "amount", "issuedAt", "dueAt"];

const FIELD_LABEL: Record<Field, string> = {
  number: "invoice number",
  customerName: "customer",
  email: "email",
  amount: "amount",
  currency: "currency",
  issuedAt: "issued date",
  dueAt: "due date",
};

export const DEFAULT_CURRENCY = "USD";

const SYMBOL_CURRENCY: ReadonlyArray<[string, string]> = [
  ["€", "EUR"],
  ["£", "GBP"],
  ["¥", "JPY"],
  ["₹", "INR"],
  ["₨", "PKR"],
];

const EmailSchema = z.email({ error: "Invalid email address" });

const normalizeHeader = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (v: string | undefined): string => (v ?? "").replace(/\s+/g, " ").trim();

export type CsvDateResult = { ok: true; date: IsoDate } | { ok: false; message: string };

export function parseCsvDate(input: string): CsvDateResult {
  const value = input.trim();

  const yearFirst = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T ].*)?$/.exec(value);
  if (yearFirst) {
    const iso = `${yearFirst[1]}-${yearFirst[2]}-${yearFirst[3]}`;
    return isValidIsoDate(iso) ? { ok: true, date: iso } : { ok: false, message: `"${value}" is not a real date` };
  }

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (us) {
    const [month, day, year] = [Number(us[1]), Number(us[2]), us[3]];
    if (month > 12) {
      return {
        ok: false,
        message: `"${value}" looks day-first; slash dates must be US MM/DD/YYYY (or use YYYY-MM-DD)`,
      };
    }
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return isValidIsoDate(iso) ? { ok: true, date: iso } : { ok: false, message: `"${value}" is not a real date` };
  }

  return { ok: false, message: `"${value}" is not a date; use YYYY-MM-DD or MM/DD/YYYY` };
}

function inferCurrency(rawAmount: string): string {
  return SYMBOL_CURRENCY.find(([symbol]) => rawAmount.includes(symbol))?.[1] ?? DEFAULT_CURRENCY;
}

export function parseInvoiceCsv(text: string): CsvParseResult {
  const source = text.replace(/^﻿/, "");
  if (source.trim() === "") return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };

  const parsed = Papa.parse<string[]>(source, { header: false, skipEmptyLines: false });
  const errors: CsvError[] = [];
  const badRecords = new Set<number>();
  for (const e of parsed.errors) {
    const line = (e.row ?? 0) + 1;
    badRecords.add(line);
    errors.push({ line, message: `Malformed CSV: ${e.message}` });
  }

  const [header = [], ...records] = parsed.data;
  const columns = new Map<Field, number>();
  header.forEach((name, index) => {
    const key = normalizeHeader(name);
    for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
      if (!columns.has(field) && HEADER_ALIASES[field].includes(key)) columns.set(field, index);
    }
  });

  const missing = REQUIRED.filter((f) => !columns.has(f));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Missing required column(s): ${missing.map((f) => FIELD_LABEL[f]).join(", ")}.` }],
    };
  }

  const rows: ValidRow[] = [];
  const seenNumbers = new Map<string, number>();

  records.forEach((record, index) => {
    const line = index + 2;
    if (badRecords.has(line)) return;
    if (record.every((cell) => cell.trim() === "")) return;

    const get = (field: Field): string => {
      const col = columns.get(field);
      return col === undefined ? "" : clean(record[col]);
    };
    const rowErrors: string[] = [];
    const require = (field: Field): string => {
      const value = get(field);
      if (value === "") rowErrors.push(`Missing ${FIELD_LABEL[field]}.`);
      return value;
    };

    const number = require("number");
    const customerName = require("customerName");
    const email = require("email");
    const rawAmount = require("amount");
    const rawIssued = require("issuedAt");
    const rawDue = require("dueAt");

    if (email && !EmailSchema.safeParse(email).success) rowErrors.push(`Invalid email address "${email}".`);

    let amountCents = 0;
    if (rawAmount) {
      const cents = parseAmountToCents(rawAmount);
      if (cents === null) rowErrors.push(`Could not read amount "${rawAmount}".`);
      else if (cents <= 0) rowErrors.push(`Amount must be greater than zero (got "${rawAmount}").`);
      else amountCents = cents;
    }

    const rawCurrency = get("currency");
    const currency = rawCurrency ? rawCurrency.toUpperCase() : inferCurrency(rawAmount);
    if (!/^[A-Z]{3}$/.test(currency)) rowErrors.push(`Currency "${rawCurrency}" must be a 3-letter ISO code.`);

    let issuedAt = "";
    let dueAt = "";
    if (rawIssued) {
      const r = parseCsvDate(rawIssued);
      if (r.ok) issuedAt = r.date;
      else rowErrors.push(`Issued date: ${r.message}.`);
    }
    if (rawDue) {
      const r = parseCsvDate(rawDue);
      if (r.ok) dueAt = r.date;
      else rowErrors.push(`Due date: ${r.message}.`);
    }
    if (issuedAt && dueAt && dueAt < issuedAt) rowErrors.push(`Due date ${dueAt} is before issued date ${issuedAt}.`);

    if (number) {
      const firstLine = seenNumbers.get(number);
      if (firstLine !== undefined) rowErrors.push(`Duplicate invoice number "${number}" (first seen on line ${firstLine}).`);
      else seenNumbers.set(number, line);
    }

    if (rowErrors.length > 0) {
      for (const message of rowErrors) errors.push({ line, message });
      return;
    }
    rows.push({ line, number, customerName, email, amountCents, currency, issuedAt, dueAt });
  });

  errors.sort((a, b) => a.line - b.line);
  return { rows, errors };
}
