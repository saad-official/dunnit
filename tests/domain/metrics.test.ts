import { describe, expect, it } from "vitest";
import { computeMetrics, median } from "@/lib/domain/metrics";
import type { Invoice, Reply, ReplyClassification, Touch } from "@/lib/domain/types";
import { makeInvoice, makeTouch } from "./fixtures/entities";

const now = new Date("2026-10-05T14:00:00Z"); // Monday

const inv = (id: string, o: Partial<Invoice>): Invoice => makeInvoice({ id, number: `INV-${id}`, ...o });

// A: open, overdue          B: open, not yet due        C: paid after a sent touch
// D: paid, never touched    E: paid, touch sent AFTER payment
// F: disputed, overdue      G: written off              H: pending verification, due today
const invoices: Invoice[] = [
  inv("A", { amountCents: 100000, issuedAt: "2026-09-01", dueAt: "2026-10-01", status: "open" }),
  inv("B", { amountCents: 50000, issuedAt: "2026-09-20", dueAt: "2026-10-20", status: "open" }),
  inv("C", { amountCents: 30000, issuedAt: "2026-08-01", dueAt: "2026-08-31", status: "paid", paidAt: new Date("2026-09-10T15:00:00Z") }),
  inv("D", { amountCents: 20000, issuedAt: "2026-08-10", dueAt: "2026-09-09", status: "paid", paidAt: new Date("2026-08-30T12:00:00Z") }),
  inv("E", { amountCents: 70000, issuedAt: "2026-09-01", dueAt: "2026-09-15", status: "paid", paidAt: new Date("2026-10-02T10:00:00Z") }),
  inv("F", { amountCents: 40000, issuedAt: "2026-09-05", dueAt: "2026-09-25", status: "disputed" }),
  inv("G", { amountCents: 10000, issuedAt: "2026-07-01", dueAt: "2026-07-31", status: "written_off" }),
  inv("H", { amountCents: 25000, issuedAt: "2026-09-10", dueAt: "2026-10-05", status: "pending_verification" }),
];

const touches: Touch[] = [
  makeTouch({ id: "t1", invoiceId: "C", status: "sent", sentAt: new Date("2026-09-01T13:00:00Z") }),
  makeTouch({ id: "t2", invoiceId: "E", status: "sent", sentAt: new Date("2026-10-05T13:00:00Z") }),
  makeTouch({ id: "t3", invoiceId: "E", status: "draft", sentAt: undefined }),
  makeTouch({ id: "t4", invoiceId: "A", status: "draft", sentAt: undefined }),
  makeTouch({ id: "t5", invoiceId: "B", status: "approved", sentAt: undefined }),
  // A rejected touch with a sentAt must not count as sent.
  makeTouch({ id: "t6", invoiceId: "D", status: "rejected", sentAt: new Date("2026-08-20T13:00:00Z") }),
];

const cls = (o: Partial<ReplyClassification>): ReplyClassification => ({
  intent: "promise_to_pay",
  summary: "s",
  suggestedAction: "a",
  confidence: 0.9,
  ...o,
});

const reply = (id: string, invoiceId: string, classification: ReplyClassification | null): Reply => ({
  id,
  invoiceId,
  receivedAt: new Date("2026-09-01T12:00:00Z"),
  classification,
  handled: true,
});

const replies: Reply[] = [
  reply("r1", "C", cls({ promiseDate: "2026-09-08" })), // paid 09-10 <= 09-11: kept
  reply("r2", "E", cls({ promiseDate: "2026-09-25" })), // paid 10-02 > 09-28: broken
  reply("r3", "A", cls({ promiseDate: "2026-10-04" })), // window open until 10-07: unresolved
  reply("r4", "B", cls({ promiseDate: "2026-09-01", confidence: 0.4 })), // low confidence: ignored
  reply("r5", "F", cls({ intent: "dispute" })),
  reply("r6", "D", cls({ promiseDate: null })),
  reply("r7", "D", null),
];

describe("computeMetrics: tiles", () => {
  const m = computeMetrics(invoices, touches, replies, now);

  it("outstanding = open + pending_verification + disputed + paused", () => {
    expect(m.outstandingCents).toBe(100000 + 50000 + 40000 + 25000);
  });

  it("overdue = outstanding with due date strictly before today", () => {
    expect(m.overdueCents).toBe(100000 + 40000);
  });

  it("recovered after touch counts only invoices with a sent touch before paidAt", () => {
    expect(m.recoveredAfterTouchCents).toBe(30000);
  });

  it("promise-kept rate over resolved, confident promises", () => {
    expect(m.promiseKeptRate).toBe(0.5);
  });

  it("median days to pay is issued -> paid in calendar days", () => {
    // C: 40, D: 20, E: 31
    expect(m.medianDaysToPay).toBe(31);
  });

  it("queue size counts draft touches", () => {
    expect(m.queueSize).toBe(2);
  });
});

describe("computeMetrics: weekly series", () => {
  const m = computeMetrics(invoices, touches, replies, now);

  it("has 12 Monday-aligned weeks ending with the current week", () => {
    expect(m.dsoTrend).toHaveLength(12);
    expect(m.recoveredPerWeek).toHaveLength(12);
    expect(m.dsoTrend[11].weekStart).toBe("2026-10-05");
    expect(m.dsoTrend[0].weekStart).toBe("2026-07-20");
    expect(m.recoveredPerWeek.map((w) => w.weekStart)).toEqual(m.dsoTrend.map((w) => w.weekStart));
  });

  it("DSO = outstanding / (billed in trailing 90d / 90), for the current week as of now", () => {
    // outstanding 215000, billed 335000 (G issued 07-01 is outside 90d)
    expect(m.dsoTrend[11].dso).toBe(57.8);
  });

  it("DSO for a past week uses state as of the week end", () => {
    const week = m.dsoTrend.find((w) => w.weekStart === "2026-09-07");
    // outstanding at 09-14: A, E (paid later), F, H = 235000; billed 295000
    expect(week?.dso).toBe(71.7);
  });

  it("DSO is 0 when billed but nothing outstanding, and null when nothing billed", () => {
    expect(m.dsoTrend[0].dso).toBe(0); // only G (written off) billed
    const empty = computeMetrics([], [], [], now);
    expect(empty.dsoTrend.every((w) => w.dso === null)).toBe(true);
  });

  it("recovered per week buckets by paidAt", () => {
    const byWeek = Object.fromEntries(m.recoveredPerWeek.map((w) => [w.weekStart, w.cents]));
    expect(byWeek["2026-09-07"]).toBe(30000);
    expect(m.recoveredPerWeek.reduce((s, w) => s + w.cents, 0)).toBe(30000);
  });
});

describe("computeMetrics: edge cases", () => {
  it("returns nulls for rates and medians with no data", () => {
    const m = computeMetrics([], [], [], now);
    expect(m).toMatchObject({
      outstandingCents: 0,
      overdueCents: 0,
      recoveredAfterTouchCents: 0,
      promiseKeptRate: null,
      medianDaysToPay: null,
      queueSize: 0,
    });
  });

  it("promise paid at the last minute of promiseDate + 3 days is kept", () => {
    const paid = inv("P", { status: "paid", paidAt: new Date("2026-09-13T23:59:59Z") });
    const m = computeMetrics([paid], [], [reply("r", "P", cls({ promiseDate: "2026-09-10" }))], now);
    expect(m.promiseKeptRate).toBe(1);
  });

  it("uses the org time zone for 'today' when deciding overdue", () => {
    const late = new Date("2026-10-05T02:00:00Z"); // still Oct 4 in New York
    const due = [inv("X", { dueAt: "2026-10-04", amountCents: 999 })];
    expect(computeMetrics(due, [], [], late).overdueCents).toBe(999);
    expect(computeMetrics(due, [], [], late, { timezone: "America/New_York" }).overdueCents).toBe(0);
  });
});

describe("median", () => {
  it("handles odd, even and empty inputs without mutating", () => {
    const values = [5, 1, 3];
    expect(median(values)).toBe(3);
    expect(values).toEqual([5, 1, 3]);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
