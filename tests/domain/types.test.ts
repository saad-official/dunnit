import { describe, expect, it } from "vitest";
import {
  DraftOutputSchema,
  REPLY_INTENTS,
  ReplyClassificationSchema,
} from "@/lib/domain/types";

describe("ReplyClassificationSchema", () => {
  it("accepts a full promise_to_pay classification", () => {
    const parsed = ReplyClassificationSchema.parse({
      intent: "promise_to_pay",
      promiseDate: "2026-10-15",
      amountCents: 120000,
      summary: "Will pay on the 15th",
      suggestedAction: "Pause until the 16th",
      confidence: 0.92,
    });
    expect(parsed.promiseDate).toBe("2026-10-15");
  });

  it("accepts null optional fields as LLMs often emit them", () => {
    const parsed = ReplyClassificationSchema.parse({
      intent: "question",
      promiseDate: null,
      amountCents: null,
      summary: "Asks for a copy of the invoice",
      suggestedAction: "Send PDF",
      confidence: 0.7,
    });
    expect(parsed.promiseDate).toBeNull();
  });

  it("covers exactly the spec 3.6 intents", () => {
    expect([...REPLY_INTENTS].sort()).toEqual(
      [
        "dispute",
        "other",
        "out_of_office",
        "paid",
        "promise_to_pay",
        "question",
        "unsubscribe",
        "wrong_contact",
      ].sort(),
    );
  });

  it.each([
    [{ intent: "angry" }],
    [{ intent: "paid", summary: "x", suggestedAction: "y", confidence: 1.2 }],
    [{ intent: "paid", summary: "x", suggestedAction: "y", confidence: 0.9, promiseDate: "15/10/2026" }],
    [{ intent: "paid", summary: "x", suggestedAction: "y", confidence: 0.9, amountCents: 10.5 }],
    [{ intent: "paid", summary: "x", suggestedAction: "y", confidence: 0.9, amountCents: -1 }],
  ])("rejects invalid payload %#", (payload) => {
    expect(ReplyClassificationSchema.safeParse(payload).success).toBe(false);
  });
});

describe("DraftOutputSchema", () => {
  it("accepts a valid draft", () => {
    const ok = DraftOutputSchema.safeParse({
      subject: "Invoice INV-1 is past due",
      body: "Hi",
      confidence: 0.8,
      rationale: "Step 1 friendly",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects out-of-range confidence and empty subject", () => {
    expect(
      DraftOutputSchema.safeParse({ subject: "", body: "b", confidence: 0.5, rationale: "r" }).success,
    ).toBe(false);
    expect(
      DraftOutputSchema.safeParse({ subject: "s", body: "b", confidence: -0.1, rationale: "r" }).success,
    ).toBe(false);
  });
});
