import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEND_WINDOW,
  isPauseExpired,
  minGapOk,
  nextSendTime,
  pauseFor,
  planCadence,
  resume,
  shouldStop,
  type CadencePolicy,
} from "@/lib/domain/cadence";
import { makeCadence, makeCustomer, makeInvoice } from "./fixtures/entities";

const NY: CadencePolicy = { timezone: "America/New_York" };
const KHI: CadencePolicy = { timezone: "Asia/Karachi" };
const iso = (d: Date) => d.toISOString();

describe("nextSendTime", () => {
  it("returns the same instant when already inside the window", () => {
    const t = new Date("2026-10-05T14:00:00Z"); // Mon 10:00 EDT
    expect(iso(nextSendTime(t, "America/New_York"))).toBe(iso(t));
  });

  it("moves an early-morning weekday time to 08:00 the same day", () => {
    const t = new Date("2026-10-05T10:00:00Z"); // Mon 06:00 EDT
    expect(iso(nextSendTime(t, "America/New_York"))).toBe("2026-10-05T12:00:00.000Z");
  });

  it("treats 18:00 as outside the window (end-exclusive)", () => {
    const t = new Date("2026-10-05T22:00:00Z"); // Mon 18:00 EDT
    expect(iso(nextSendTime(t, "America/New_York"))).toBe("2026-10-06T12:00:00.000Z");
  });

  it("allows 17:59", () => {
    const t = new Date("2026-10-05T21:59:00Z");
    expect(iso(nextSendTime(t, "America/New_York"))).toBe(iso(t));
  });

  it("moves Friday evening to Monday 08:00", () => {
    const t = new Date("2026-10-02T23:00:00Z"); // Fri 19:00 EDT
    expect(iso(nextSendTime(t, "America/New_York"))).toBe("2026-10-05T12:00:00.000Z");
  });

  it("lands on the correct UTC hour across spring-forward (EST to EDT)", () => {
    const t = new Date("2026-03-07T15:00:00Z"); // Sat 10:00 EST
    expect(iso(nextSendTime(t, "America/New_York"))).toBe("2026-03-09T12:00:00.000Z"); // Mon 08:00 EDT
  });

  it("lands on the correct UTC hour across fall-back (EDT to EST)", () => {
    const t = new Date("2026-10-31T14:00:00Z"); // Sat 10:00 EDT
    expect(iso(nextSendTime(t, "America/New_York"))).toBe("2026-11-02T13:00:00.000Z"); // Mon 08:00 EST
  });

  it("uses the org local weekday, not UTC (Asia/Karachi)", () => {
    // Sun 23:30 UTC is already Mon 04:30 in Karachi.
    const t = new Date("2026-10-04T23:30:00Z");
    expect(iso(nextSendTime(t, "Asia/Karachi"))).toBe("2026-10-05T03:00:00.000Z");
  });

  it("moves Karachi Friday evening to Monday 08:00 PKT", () => {
    const t = new Date("2026-10-02T14:00:00Z"); // Fri 19:00 PKT
    expect(iso(nextSendTime(t, "Asia/Karachi"))).toBe("2026-10-05T03:00:00.000Z");
  });

  it("supports a custom window", () => {
    const t = new Date("2026-10-03T14:00:00Z"); // Sat 10:00 EDT
    const window = { weekdays: [1, 2, 3, 4, 5, 6], startHour: 9, endHour: 12 };
    expect(iso(nextSendTime(t, "America/New_York", window))).toBe(iso(t));
    const late = new Date("2026-10-03T17:00:00Z"); // Sat 13:00 EDT
    expect(iso(nextSendTime(late, "America/New_York", window))).toBe("2026-10-05T13:00:00.000Z");
  });

  it("rejects an empty or inverted window", () => {
    const t = new Date("2026-10-05T14:00:00Z");
    expect(() => nextSendTime(t, "America/New_York", { ...DEFAULT_SEND_WINDOW, weekdays: [] })).toThrow(
      RangeError,
    );
    expect(() =>
      nextSendTime(t, "America/New_York", { ...DEFAULT_SEND_WINDOW, startHour: 18, endHour: 8 }),
    ).toThrow(RangeError);
  });
});

describe("planCadence", () => {
  const now = new Date("2026-09-20T12:00:00Z");

  it("plans the default ladder at 09:00 org-local on due+1/+7/+14/+30", () => {
    const plan = planCadence(makeInvoice({ dueAt: "2026-10-01" }), makeCustomer({ riskScore: 50 }), NY, now);
    expect(plan.map((s) => [s.step, s.tone, s.dayOffset, iso(s.scheduledAt)])).toEqual([
      [1, "friendly", 1, "2026-10-02T13:00:00.000Z"],
      [2, "firm", 7, "2026-10-08T13:00:00.000Z"],
      [3, "formal", 14, "2026-10-15T13:00:00.000Z"],
      // due+30 = Sat 2026-10-31 -> Mon 08:00 EST, after DST ends on Nov 1
      [4, "final", 30, "2026-11-02T13:00:00.000Z"],
    ]);
  });

  it("schedules in Karachi local time", () => {
    const plan = planCadence(makeInvoice({ dueAt: "2026-10-01" }), makeCustomer(), KHI, now);
    expect(iso(plan[0].scheduledAt)).toBe("2026-10-02T04:00:00.000Z"); // Fri 09:00 PKT
  });

  it("high risk (>= 70) skips step 1 and starts firm at due+1", () => {
    const plan = planCadence(makeInvoice(), makeCustomer({ riskScore: 70 }), NY, now);
    expect(plan.map((s) => [s.step, s.tone, s.dayOffset])).toEqual([
      [2, "firm", 1],
      [3, "formal", 14],
      [4, "final", 30],
    ]);
    expect(iso(plan[0].scheduledAt)).toBe("2026-10-02T13:00:00.000Z");
  });

  it("low risk (<= 20) delays step 1 to due+3 and keeps the 5-day gap", () => {
    const plan = planCadence(makeInvoice(), makeCustomer({ riskScore: 20 }), NY, now);
    expect(plan.map((s) => [s.step, s.dayOffset, iso(s.scheduledAt)])).toEqual([
      // due+3 = Sun 10-04 -> Mon 08:00 EDT
      [1, 3, "2026-10-05T12:00:00.000Z"],
      // due+7 is only 3 days later; gap pushes to Sat 10-10 -> Mon 10-12 08:00
      [2, 7, "2026-10-12T12:00:00.000Z"],
      [3, 14, "2026-10-19T12:00:00.000Z"],
      [4, 30, "2026-11-02T13:00:00.000Z"],
    ]);
  });

  it("risk boundaries: 21 and 69 use the default ladder", () => {
    for (const riskScore of [21, 69]) {
      const plan = planCadence(makeInvoice(), makeCustomer({ riskScore }), NY, now);
      expect(plan.map((s) => s.dayOffset)).toEqual([1, 7, 14, 30]);
    }
  });

  it("compresses a long-overdue invoice from now, keeping every step 5+ days apart", () => {
    const later = new Date("2026-10-05T14:00:00Z"); // Mon 10:00 EDT
    const plan = planCadence(makeInvoice({ dueAt: "2026-08-01" }), makeCustomer(), NY, later);
    expect(plan.map((s) => iso(s.scheduledAt))).toEqual([
      "2026-10-05T14:00:00.000Z",
      "2026-10-12T12:00:00.000Z",
      "2026-10-19T12:00:00.000Z",
      "2026-10-26T12:00:00.000Z",
    ]);
    for (let i = 1; i < plan.length; i++) {
      expect(minGapOk(plan[i - 1].scheduledAt, plan[i].scheduledAt)).toBe(true);
    }
  });

  it("every planned time is inside the send window, across a DST change", () => {
    const plan = planCadence(makeInvoice({ dueAt: "2026-03-06" }), makeCustomer({ riskScore: 10 }), NY, new Date("2026-03-01T00:00:00Z"));
    expect(plan).toHaveLength(4);
    for (const step of plan) {
      expect(iso(nextSendTime(step.scheduledAt, "America/New_York"))).toBe(iso(step.scheduledAt));
    }
  });

  it("returns no steps when the cadence should stop", () => {
    expect(planCadence(makeInvoice({ status: "paid" }), makeCustomer(), NY, now)).toEqual([]);
    expect(planCadence(makeInvoice(), makeCustomer({ doNotContact: true }), NY, now)).toEqual([]);
  });

  it("respects a custom send hour and gap", () => {
    const plan = planCadence(makeInvoice(), makeCustomer(), { ...NY, sendHour: 14, minGapDays: 7 }, now);
    expect(iso(plan[0].scheduledAt)).toBe("2026-10-02T18:00:00.000Z");
    expect(iso(plan[1].scheduledAt)).toBe("2026-10-09T18:00:00.000Z");
  });
});

describe("minGapOk", () => {
  const last = new Date("2026-10-01T13:00:00Z");

  it("is true when nothing was sent yet", () => {
    expect(minGapOk(undefined, last)).toBe(true);
    expect(minGapOk(null, last)).toBe(true);
  });

  it("requires 5 x 24h of elapsed time by default", () => {
    expect(minGapOk(last, new Date("2026-10-06T12:59:59Z"))).toBe(false);
    expect(minGapOk(last, new Date("2026-10-06T13:00:00Z"))).toBe(true);
  });

  it("measures elapsed time, so a DST change does not shorten the gap", () => {
    const before = new Date("2026-03-05T14:00:00Z"); // Thu 09:00 EST
    expect(minGapOk(before, new Date("2026-03-10T13:00:00Z"))).toBe(false); // Tue 09:00 EDT, 119h
    expect(minGapOk(before, new Date("2026-03-10T14:00:00Z"))).toBe(true);
  });

  it("accepts a custom gap", () => {
    expect(minGapOk(last, new Date("2026-10-03T13:00:00Z"), 2)).toBe(true);
  });
});

describe("shouldStop", () => {
  it.each([
    ["paid", "paid"],
    ["written_off", "written_off"],
    ["paused", "invoice_paused"],
    ["disputed", "disputed"],
    ["pending_verification", "pending_verification"],
  ] as const)("stops for invoice status %s", (status, reason) => {
    expect(shouldStop(makeInvoice({ status }), makeCustomer())).toBe(reason);
  });

  it("stops for do-not-contact customers", () => {
    expect(shouldStop(makeInvoice(), makeCustomer({ doNotContact: true }))).toBe("do_not_contact");
  });

  it.each(["wrong_contact", "bounced"] as const)("stops while the contact is flagged %s", (contactFlag) => {
    expect(shouldStop(makeInvoice(), makeCustomer({ contactFlag }))).toBe("contact_flagged");
  });

  it("does not stop for contactFlag none", () => {
    expect(shouldStop(makeInvoice(), makeCustomer({ contactFlag: "none" }))).toBeNull();
  });

  it("prefers the invoice being paid over do-not-contact", () => {
    expect(shouldStop(makeInvoice({ status: "paid" }), makeCustomer({ doNotContact: true }))).toBe("paid");
  });

  it("returns null for an open invoice and contactable customer", () => {
    expect(shouldStop(makeInvoice(), makeCustomer())).toBeNull();
  });
});

describe("pauseFor / resume", () => {
  const now = new Date("2026-10-05T14:00:00Z");

  it("pauses with a reason and an end date, pushing nextRunAt to the end", () => {
    const until = new Date("2026-10-16T00:00:00Z");
    const paused = pauseFor(makeCadence(), "promise_to_pay", until);
    expect(paused).toMatchObject({
      status: "paused",
      pauseReason: "promise_to_pay",
      pausedUntil: until,
      nextRunAt: until,
    });
  });

  it("keeps nextRunAt when it is already later than the pause end", () => {
    const cadence = makeCadence({ nextRunAt: new Date("2026-10-20T13:00:00Z") });
    const paused = pauseFor(cadence, "question", new Date("2026-10-10T00:00:00Z"));
    expect(iso(paused.nextRunAt)).toBe("2026-10-20T13:00:00.000Z");
  });

  it("pauses indefinitely when no end is given", () => {
    const paused = pauseFor(makeCadence({ pausedUntil: new Date("2026-10-09T00:00:00Z") }), "dispute");
    expect(paused.status).toBe("paused");
    expect("pausedUntil" in paused).toBe(false);
  });

  it("does not pause stopped or completed cadences", () => {
    const stopped = makeCadence({ status: "stopped" });
    expect(pauseFor(stopped, "x")).toBe(stopped);
    const done = makeCadence({ status: "completed" });
    expect(pauseFor(done, "x")).toBe(done);
  });

  it("does not mutate its input", () => {
    const cadence = makeCadence();
    pauseFor(cadence, "x");
    expect(cadence.status).toBe("active");
  });

  it("resume clears pause fields and never schedules in the past", () => {
    const paused = pauseFor(makeCadence({ nextRunAt: new Date("2026-10-01T13:00:00Z") }), "question");
    const resumed = resume(paused, now);
    expect(resumed.status).toBe("active");
    expect("pauseReason" in resumed).toBe(false);
    expect("pausedUntil" in resumed).toBe(false);
    expect(iso(resumed.nextRunAt)).toBe(iso(now));
  });

  it("resume keeps a future nextRunAt", () => {
    const paused = pauseFor(makeCadence(), "promise_to_pay", new Date("2026-10-16T00:00:00Z"));
    expect(iso(resume(paused, now).nextRunAt)).toBe("2026-10-16T00:00:00.000Z");
  });

  it("resume is a no-op for non-paused cadences", () => {
    const active = makeCadence();
    expect(resume(active, now)).toBe(active);
  });

  it("isPauseExpired only for timed pauses whose end has passed", () => {
    const timed = pauseFor(makeCadence(), "promise_to_pay", new Date("2026-10-05T00:00:00Z"));
    expect(isPauseExpired(timed, now)).toBe(true);
    expect(isPauseExpired(timed, new Date("2026-10-04T23:59:59Z"))).toBe(false);
    expect(isPauseExpired(pauseFor(makeCadence(), "dispute"), now)).toBe(false);
    expect(isPauseExpired(makeCadence(), now)).toBe(false);
  });
});
