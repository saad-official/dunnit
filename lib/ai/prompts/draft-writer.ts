import "server-only";
import { generateStructured, type CallMeta } from "@/lib/ai/generate";
import { DraftOutputSchema, type DraftOutput, type Tone } from "@/lib/domain/types";
import { validateDraft, type DraftValidation } from "@/lib/domain/guardrails";

export const DRAFT_WRITER_PROMPT_VERSION = "draft-writer/v1";

export type PriorTouchSummary = {
  step: number;
  tone: Tone;
  sentAt: string; // ISO date
  subject: string;
};

export type PriorReplySummary = {
  receivedAt: string; // ISO date
  intent: string;
  summary: string;
};

export type DraftWriterInput = {
  step: 1 | 2 | 3 | 4;
  tone: Tone;
  businessName: string;
  signature: string;
  toneNotes: string;
  customerName: string;
  customerCompany?: string | null;
  invoiceNumber: string;
  amountFormatted: string;
  issuedAt: string; // ISO date
  dueAt: string; // ISO date
  daysOverdue: number;
  priorTouches: PriorTouchSummary[];
  priorReplies: PriorReplySummary[];
  /** Owner feedback from rejected drafts, newest first (max 3). */
  rejectionReasons?: string[];
  payUrl?: string | null;
  /** Set for the gentle follow-up after a promise-to-pay date has passed. */
  checkIn?: { promiseDate: string } | null;
};

export type DraftWriterResult = {
  draft: DraftOutput;
  validation: DraftValidation;
  meta: CallMeta;
};

const TONE_GUIDE: Record<Tone, string> = {
  friendly:
    "Warm and brief. Assume the invoice was simply missed. Offer to resend it. No pressure language.",
  firm: "Direct and courteous. State the overdue status plainly, ask for a payment date, and offer to help if something is blocking payment.",
  formal:
    "Formal register. Reference the earlier reminders by date, state the amount and days overdue, and set a clear expectation: payment or a payment plan within 7 days. No threats.",
  final:
    "Final notice. Calm and factual. State that this is the last reminder before the owner reviews next steps personally. Do not mention lawyers, agencies, credit bureaus or legal action.",
};

const INSTRUCTIONS = `You write payment reminder emails on behalf of a small business owner.
Rules:
- Write as the owner, in first person, plain English, no marketing tone.
- Keep it short: 60 to 160 words in the body. One idea per paragraph.
- Always include the invoice number and the exact amount as given.
- Never threaten, never mention legal action, collections, credit bureaus, lawyers or police.
- Never invent facts, discounts, late fees or dates that are not in the input.
- No placeholders like [Name] or {{amount}}; use the real values from the input.
- At most one exclamation mark, preferably none. No ALL CAPS.
- End with the provided signature exactly.
- The subject is specific (mentions the invoice number) and under 80 characters.
- confidence: your honest estimate (0 to 1) that the owner would send this unchanged. Lower it when the history is complicated (disputes, questions, many prior touches).
- rationale: one sentence on why this tone and content fit the history.`;

export async function writeReminderDraft(input: DraftWriterInput): Promise<DraftWriterResult> {
  const prompt = buildPrompt(input);
  const { object, meta } = await generateStructured({
    name: "draft_writer",
    promptVersion: DRAFT_WRITER_PROMPT_VERSION,
    schema: DraftOutputSchema,
    instructions: INSTRUCTIONS,
    prompt,
    temperature: 0.5,
  });

  const validation = validateDraft(object, {
    invoiceNumber: input.invoiceNumber,
    amountFormatted: input.amountFormatted,
    customerName: input.customerName,
    signature: input.signature,
  });

  return {
    draft: { ...object, confidence: validation.adjustedConfidence },
    validation,
    meta,
  };
}

export function buildPrompt(input: DraftWriterInput): string {
  const history =
    input.priorTouches.length === 0
      ? "No reminders have been sent yet."
      : input.priorTouches
          .map((t) => `- Step ${t.step} (${t.tone}) sent ${t.sentAt}: "${t.subject}"`)
          .join("\n");

  const replies =
    input.priorReplies.length === 0
      ? "No replies received."
      : input.priorReplies
          .map((r) => `- ${r.receivedAt}: ${r.intent}. ${r.summary}`)
          .join("\n");

  const feedback =
    input.rejectionReasons && input.rejectionReasons.length > 0
      ? `Owner feedback on earlier drafts (apply it):\n${input.rejectionReasons.map((r) => `- ${r}`).join("\n")}`
      : "";

  return [
    input.checkIn
      ? `Gentle check-in. The customer promised to pay by ${input.checkIn.promiseDate} and that date has passed. Ask kindly whether the payment went out, without accusing. Tone: friendly.`
      : `Reminder step: ${input.step} of 4. Tone: ${input.tone}. ${TONE_GUIDE[input.tone]}`,
    "",
    `Business: ${input.businessName}`,
    `Signature (use exactly):\n${input.signature}`,
    input.toneNotes ? `Owner's voice notes: ${input.toneNotes}` : "",
    "",
    `Customer: ${input.customerName}${input.customerCompany ? ` at ${input.customerCompany}` : ""}`,
    `Invoice: ${input.invoiceNumber}`,
    `Amount: ${input.amountFormatted}`,
    `Issued: ${input.issuedAt}. Due: ${input.dueAt}. Days overdue: ${input.daysOverdue}.`,
    input.payUrl ? `Payment link to include: ${input.payUrl}` : "There is no payment link; ask them to use the details on the invoice.",
    "",
    `Previous reminders:\n${history}`,
    "",
    `Replies so far:\n${replies}`,
    feedback ? `\n${feedback}` : "",
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .trim();
}
