import { describe, expect, it } from "vitest";
import {
  MIN_CLASSIFICATION_CONFIDENCE,
  PAUSE_REASONS,
  handleReply,
} from "@/lib/domain/replies";
import type { ReplyClassification } from "@/lib/domain/types";
import { makeCadence, makeInvoice } from "./fixtures/entities";

const now = new Date("2026-10-05T14:00:00Z");

function classification(overrides: Partial<ReplyClassification> = {}): ReplyClassification {
  return {
    intent: "other",
    summary: "Customer replied",
    suggestedAction: "Review",
    confidence: 0.9,
    ...overrides,
  };
}

const indefinitePause = (reason: string) => ({
  status: "paused",
  pauseReason: reason,
  pausedUntil: null,
});

describe("handleReply: spec 3.6 mapping", () => {
  it("paid -> pending_verification, cadence paused, confirm payment task", () => {
    const out = handleReply(classification({ intent: "paid", summary: "Paid by ACH yesterday" }), makeInvoice(), makeCadence(), now);
    expect(out.invoiceStatus).toBe("pending_verification");
    expect(out.cadencePatch).toEqual(indefinitePause(PAUSE_REASONS.paid));
    expect(out.customerPatch).toBeUndefined();
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0]).toMatchObject({ type: "confirm_payment" });
    expect(out.tasks[0].title).toContain("INV-1042");
    expect(out.tasks[0].detail).toContain("Paid by ACH yesterday");
  });

  it("paid with a smaller amount notes a possible partial payment", () => {
    const out = handleReply(classification({ intent: "paid", amountCents: 50000 }), makeInvoice(), makeCadence(), now);
    expect(out.tasks[0].detail).toMatch(/partial/i);
    expect(out.tasks[0].detail).toContain("$500.00");
    expect(out.tasks[0].detail).toContain("$1,234.50");
  });

  it("promise_to_pay -> paused until promise_date + 1 day (org-local midnight), no tasks", () => {
    const out = handleReply(
      classification({ intent: "promise_to_pay", promiseDate: "2026-10-15" }),
      makeInvoice(),
      makeCadence(),
      now,
      { timezone: "America/New_York" },
    );
    const until = new Date("2026-10-16T04:00:00Z"); // 00:00 EDT on the 16th
    expect(out.invoiceStatus).toBeUndefined();
    expect(out.cadencePatch).toEqual({
      status: "paused",
      pauseReason: PAUSE_REASONS.promise_to_pay,
      pausedUntil: until,
      nextRunAt: until,
    });
    expect(out.tasks).toEqual([]);
  });

  it("promise_to_pay defaults to UTC when no timezone is given", () => {
    const out = handleReply(classification({ intent: "promise_to_pay", promiseDate: "2026-10-15" }), makeInvoice(), makeCadence(), now);
    expect(out.cadencePatch.pausedUntil).toEqual(new Date("2026-10-16T00:00:00Z"));
  });

  it("promise_to_pay with a date already past checks in one day from now", () => {
    const out = handleReply(classification({ intent: "promise_to_pay", promiseDate: "2026-10-01" }), makeInvoice(), makeCadence(), now);
    expect(out.cadencePatch.pausedUntil).toEqual(new Date("2026-10-06T14:00:00Z"));
  });

  it("promise_to_pay without a date pauses until handled and asks the owner to review", () => {
    const out = handleReply(classification({ intent: "promise_to_pay", promiseDate: null }), makeInvoice(), makeCadence(), now);
    expect(out.cadencePatch).toEqual(indefinitePause(PAUSE_REASONS.promise_to_pay));
    expect(out.tasks.map((t) => t.type)).toEqual(["review_reply"]);
  });

  it("dispute -> invoice disputed, cadence paused, escalation card with summary", () => {
    const out = handleReply(
      classification({ intent: "dispute", summary: "Says hours billed are wrong" }),
      makeInvoice(),
      makeCadence(),
      now,
    );
    expect(out.invoiceStatus).toBe("disputed");
    expect(out.cadencePatch).toEqual(indefinitePause(PAUSE_REASONS.dispute));
    expect(out.tasks).toEqual([
      expect.objectContaining({ type: "escalation", detail: expect.stringContaining("Says hours billed are wrong") }),
    ]);
  });

  it("question -> cadence paused until handled, draft-reply task", () => {
    const out = handleReply(
      classification({ intent: "question", summary: "Asks for a W-9", suggestedAction: "Attach W-9" }),
      makeInvoice(),
      makeCadence(),
      now,
    );
    expect(out.invoiceStatus).toBeUndefined();
    expect(out.cadencePatch).toEqual(indefinitePause(PAUSE_REASONS.question));
    expect(out.tasks).toEqual([
      expect.objectContaining({ type: "draft_reply", detail: expect.stringContaining("Attach W-9") }),
    ]);
  });

  it("wrong_contact -> cadence paused, customer contact_flag set, fix-contact task", () => {
    const out = handleReply(classification({ intent: "wrong_contact" }), makeInvoice(), makeCadence(), now);
    expect(out.cadencePatch).toEqual(indefinitePause(PAUSE_REASONS.wrong_contact));
    expect(out.customerPatch).toEqual({ contactFlag: "wrong_contact" });
    expect(out.tasks.map((t) => t.type)).toEqual(["fix_contact"]);
  });

  it("out_of_office -> next touch delayed 3 days, cadence stays active", () => {
    const cadence = makeCadence({ nextRunAt: new Date("2026-10-08T13:00:00Z") });
    const out = handleReply(classification({ intent: "out_of_office" }), makeInvoice(), cadence, now);
    expect(out.cadencePatch).toEqual({ nextRunAt: new Date("2026-10-11T13:00:00Z") });
    expect(out.tasks).toEqual([]);
    expect(out.invoiceStatus).toBeUndefined();
  });

  it("out_of_office delays from now when the next run is already due", () => {
    const cadence = makeCadence({ nextRunAt: new Date("2026-10-01T13:00:00Z") });
    const out = handleReply(classification({ intent: "out_of_office" }), makeInvoice(), cadence, now);
    expect(out.cadencePatch).toEqual({ nextRunAt: new Date("2026-10-08T14:00:00Z") });
  });

  it("unsubscribe -> do_not_contact = true and cadence stopped", () => {
    const out = handleReply(classification({ intent: "unsubscribe" }), makeInvoice(), makeCadence(), now);
    expect(out.customerPatch).toEqual({ doNotContact: true, contactFlag: "unsubscribed" });
    expect(out.cadencePatch).toEqual({ status: "stopped", pausedUntil: null, pauseReason: null });
    expect(out.tasks).toEqual([]);
  });

  it("other -> paused until handled (spec 3.2) with a review task", () => {
    const out = handleReply(classification({ intent: "other" }), makeInvoice(), makeCadence(), now);
    expect(out.cadencePatch).toEqual(indefinitePause(PAUSE_REASONS.needs_review));
    expect(out.tasks.map((t) => t.type)).toEqual(["review_reply"]);
  });
});

describe("handleReply: low confidence", () => {
  it.each(["paid", "dispute", "unsubscribe", "out_of_office", "promise_to_pay"] as const)(
    "%s below %s confidence only pauses and asks for review",
    (intent) => {
      const out = handleReply(
        classification({ intent, confidence: MIN_CLASSIFICATION_CONFIDENCE - 0.01, promiseDate: "2026-10-15" }),
        makeInvoice(),
        makeCadence(),
        now,
      );
      expect(out.invoiceStatus).toBeUndefined();
      expect(out.customerPatch).toBeUndefined();
      expect(out.cadencePatch).toEqual(indefinitePause(PAUSE_REASONS.needs_review));
      expect(out.tasks).toEqual([expect.objectContaining({ type: "review_reply" })]);
      expect(out.tasks[0].detail).toContain(intent);
    },
  );

  it("exactly 0.6 is trusted", () => {
    const out = handleReply(classification({ intent: "dispute", confidence: 0.6 }), makeInvoice(), makeCadence(), now);
    expect(out.invoiceStatus).toBe("disputed");
  });
});

describe("handleReply: state guards", () => {
  it("never reopens a stopped or completed cadence", () => {
    for (const status of ["stopped", "completed"] as const) {
      const out = handleReply(classification({ intent: "question" }), makeInvoice(), makeCadence({ status }), now);
      expect(out.cadencePatch).toEqual({});
      expect(out.tasks).toHaveLength(1);
    }
  });

  it("does not change status of a paid or written-off invoice", () => {
    for (const status of ["paid", "written_off"] as const) {
      const out = handleReply(classification({ intent: "dispute" }), makeInvoice({ status }), makeCadence(), now);
      expect(out.invoiceStatus).toBeUndefined();
    }
  });

  it("a payment claim on a disputed invoice moves it to pending_verification", () => {
    const out = handleReply(classification({ intent: "paid" }), makeInvoice({ status: "disputed" }), makeCadence(), now);
    expect(out.invoiceStatus).toBe("pending_verification");
  });
});
