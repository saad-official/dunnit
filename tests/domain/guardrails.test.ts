import { describe, expect, it } from "vitest";
import { decideAutonomy, validateDraft, type DraftContext } from "@/lib/domain/guardrails";
import type { DraftOutput } from "@/lib/domain/types";
import { makeCustomer, makeOrg } from "./fixtures/entities";

const ctx: DraftContext = {
  invoiceNumber: "INV-1042",
  amountFormatted: "$1,234.50",
  customerName: "Jordan Lee",
};

const goodBody = [
  "Hi Jordan,",
  "",
  "A quick note that invoice INV-1042 for $1,234.50 was due on October 1. If it has already gone out, thank you and please ignore this.",
  "",
  "Thanks,",
  "Maya",
].join("\n");

function draft(overrides: Partial<DraftOutput> = {}): DraftOutput {
  return {
    subject: "Friendly reminder: invoice INV-1042",
    body: goodBody,
    confidence: 0.9,
    rationale: "Step 1, friendly tone",
    ...overrides,
  };
}

const codes = (d: DraftOutput, c: DraftContext = ctx) => validateDraft(d, c).violations.map((v) => v.code);

describe("validateDraft", () => {
  it("passes a clean draft and keeps its confidence", () => {
    const result = validateDraft(draft(), ctx);
    expect(result).toEqual({ ok: true, violations: [], adjustedConfidence: 0.9 });
  });

  it("clamps confidence into [0, 1]", () => {
    expect(validateDraft(draft({ confidence: 1.4 }), ctx).adjustedConfidence).toBe(1);
  });

  it("requires the invoice number in the body", () => {
    expect(codes(draft({ body: goodBody.replace("INV-1042", "your invoice") }))).toContain("missing_invoice_number");
  });

  it("requires the formatted amount in the body", () => {
    expect(codes(draft({ body: goodBody.replace("$1,234.50", "the balance") }))).toContain("missing_amount");
  });

  it("matches amounts across no-break spaces used by some locales", () => {
    const eu: DraftContext = { ...ctx, amountFormatted: "1.234,50 €" };
    const body = goodBody.replace("$1,234.50", "1.234,50 €");
    expect(codes(draft({ body }), eu)).not.toContain("missing_amount");
  });

  it.each([
    ["Hi {{customer_name}},"],
    ["Hi [NAME],"],
    ["Hi [Customer Name],"],
    ["Hi {first_name},"],
    ["Hi <<NAME>>,"],
  ])("flags unreplaced placeholder %s", (greeting) => {
    expect(codes(draft({ body: goodBody.replace("Hi Jordan,", greeting) }))).toContain("placeholder");
  });

  it("flags placeholders in the subject too", () => {
    expect(codes(draft({ subject: "Invoice {{number}} reminder" }))).toContain("placeholder");
  });

  it("enforces subject length 3-120", () => {
    expect(codes(draft({ subject: "Hi" }))).toContain("subject_length");
    expect(codes(draft({ subject: "x".repeat(121) }))).toContain("subject_length");
    expect(codes(draft({ subject: "abc" }))).not.toContain("subject_length");
  });

  it("enforces body length 40-1800", () => {
    expect(codes(draft({ body: "INV-1042 $1,234.50\nThanks" }))).toContain("body_length");
    expect(codes(draft({ body: goodBody + "\n" + "a".repeat(1800) }))).toContain("body_length");
  });

  it.each([
    "We will take legal action.",
    "We will file a lawsuit.",
    "We will sue you.",
    "Our attorney will be in touch.",
    "Our lawyer will contact you.",
    "We will report this to the credit bureau.",
    "We may refer this to a collection agency.",
    "We will call the police.",
    "See you in court.",
    "Pay now or else.",
    "This is damn late.",
    "What the fuck.",
  ])("bans threatening or profane phrase: %s", (sentence) => {
    expect(codes(draft({ body: goodBody.replace("Thanks,", `${sentence}\n\nThanks,`) }))).toContain(
      "banned_phrase",
    );
  });

  it("does not ban innocent words that contain banned substrings", () => {
    const body = goodBody.replace("Thanks,", "The courtyard project issue is pursued.\n\nThanks,");
    expect(codes(draft({ body }))).not.toContain("banned_phrase");
  });

  it("flags ALL-CAPS shouting of more than 3 words", () => {
    const body = goodBody.replace("Thanks,", "PLEASE PAY THIS NOW.\n\nThanks,");
    expect(codes(draft({ body }))).toContain("shouting");
  });

  it("allows up to 3 capitalised words and uppercase invoice numbers or company names", () => {
    const subject = "FINAL NOTICE: invoice INV-1042";
    const body = goodBody.replace("Thanks,", "ACME CORP HOLDINGS LTD is listed as the payer.\n\nThanks,");
    const result = validateDraft(draft({ subject, body }), { ...ctx, customerName: "ACME CORP HOLDINGS LTD" });
    expect(result.violations.map((v) => v.code)).not.toContain("shouting");
  });

  it("allows one exclamation mark across subject and body, not two", () => {
    expect(codes(draft({ subject: "Quick reminder!" }))).not.toContain("exclamation");
    expect(codes(draft({ subject: "Quick reminder!", body: goodBody.replace("Thanks,", "Thanks!") }))).toContain(
      "exclamation",
    );
  });

  it("requires a sign-off", () => {
    const body = goodBody.replace("\n\nThanks,\nMaya", "");
    expect(codes(draft({ body }))).toContain("missing_sign_off");
  });

  it.each(["Best regards,", "Kind regards,", "Sincerely,", "Thank you,", "Cheers,", "Best,", "Regards,", "Warmly,"])(
    "accepts sign-off %s",
    (closing) => {
      expect(codes(draft({ body: goodBody.replace("Thanks,", closing) }))).not.toContain("missing_sign_off");
    },
  );

  it("accepts the org signature as a sign-off", () => {
    const body = goodBody.replace("Thanks,\nMaya", "Maya, Harbor Design Co");
    expect(codes(draft({ body }), { ...ctx, signature: "Maya, Harbor Design Co" })).not.toContain("missing_sign_off");
  });

  it("drops adjustedConfidence to 0 on any violation and reports all of them", () => {
    const result = validateDraft(draft({ subject: "Hi!!", body: "short" }), ctx);
    expect(result.ok).toBe(false);
    expect(result.adjustedConfidence).toBe(0);
    expect(result.violations.length).toBeGreaterThanOrEqual(4);
    for (const v of result.violations) expect(v.message.length).toBeGreaterThan(0);
  });
});

describe("decideAutonomy", () => {
  const lowRisk = makeCustomer({ riskScore: 10 });
  const midRisk = makeCustomer({ riskScore: 40 });

  it("free plan always needs approval", () => {
    for (const autonomy of ["manual", "auto_step1", "auto_all_low_risk"] as const) {
      expect(decideAutonomy(makeOrg({ plan: "free", autonomy }), 1, 1, lowRisk)).toBe("needs_approval");
    }
  });

  it("manual always needs approval", () => {
    expect(decideAutonomy(makeOrg({ autonomy: "manual" }), 1, 1, lowRisk)).toBe("needs_approval");
  });

  it("auto_step1 auto-sends only step 1 at confidence >= 0.8", () => {
    const org = makeOrg({ autonomy: "auto_step1" });
    expect(decideAutonomy(org, 1, 0.8, midRisk)).toBe("auto_send");
    expect(decideAutonomy(org, 1, 0.79, midRisk)).toBe("needs_approval");
    expect(decideAutonomy(org, 2, 0.99, lowRisk)).toBe("needs_approval");
  });

  it("auto_step1 does not need a customer", () => {
    expect(decideAutonomy(makeOrg({ autonomy: "auto_step1" }), 1, 0.9)).toBe("auto_send");
  });

  it("auto_all_low_risk auto-sends steps <= 2 at >= 0.85 for risk < 40", () => {
    const org = makeOrg({ autonomy: "auto_all_low_risk" });
    expect(decideAutonomy(org, 2, 0.85, makeCustomer({ riskScore: 39 }))).toBe("auto_send");
    expect(decideAutonomy(org, 2, 0.84, lowRisk)).toBe("needs_approval");
    expect(decideAutonomy(org, 2, 0.9, midRisk)).toBe("needs_approval");
    expect(decideAutonomy(org, 3, 0.99, lowRisk)).toBe("needs_approval");
    expect(decideAutonomy(org, 2, 0.9)).toBe("needs_approval");
  });

  it("auto_all_low_risk is a superset of auto_step1", () => {
    const org = makeOrg({ autonomy: "auto_all_low_risk" });
    expect(decideAutonomy(org, 1, 0.8, midRisk)).toBe("auto_send");
  });

  it("never auto-sends step 4, to do-not-contact customers, or with invalid confidence", () => {
    const org = makeOrg({ autonomy: "auto_all_low_risk" });
    expect(decideAutonomy(org, 4, 1, lowRisk)).toBe("needs_approval");
    expect(decideAutonomy(org, 1, 1, makeCustomer({ doNotContact: true }))).toBe("needs_approval");
    expect(decideAutonomy(org, 1, Number.NaN, lowRisk)).toBe("needs_approval");
  });
});
