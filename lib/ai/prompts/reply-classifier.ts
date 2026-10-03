import "server-only";
import { generateStructured, type CallMeta } from "@/lib/ai/generate";
import {
  ReplyClassificationSchema,
  type ReplyClassification,
} from "@/lib/domain/types";

export const REPLY_CLASSIFIER_PROMPT_VERSION = "reply-classifier/v1";

export type ReplyClassifierInput = {
  replyText: string;
  fromEmail: string;
  /** ISO date of the day the reply was received, in the org timezone. */
  receivedOn: string;
  invoiceNumber: string;
  amountFormatted: string;
  amountCents: number;
  dueAt: string;
  customerName: string;
  lastTouchSubject?: string | null;
};

const INSTRUCTIONS = `You classify replies to payment reminder emails for a small business.
Pick exactly one intent:
- paid: they say the payment was made or is on its way (transfer sent, cheque mailed, card charged).
- promise_to_pay: they commit to paying on or by a date, or "next week", "end of month". Resolve relative dates against the received date and return promiseDate as YYYY-MM-DD. If they commit without any date, still use promise_to_pay and leave promiseDate null.
- dispute: they say the invoice is wrong, the work was not done, the amount is incorrect, or they refuse to pay.
- question: they ask for information (a copy of the invoice, payment details, a W-9, who to pay) without disputing.
- wrong_contact: they say they are not the right person or the email reached the wrong place.
- out_of_office: an automatic out-of-office or vacation responder.
- unsubscribe: they ask to stop receiving these emails.
- other: anything else, including empty or unrelated messages.
Rules:
- amountCents: only if they state a specific amount they will pay or did pay, in cents; otherwise null.
- summary: one neutral sentence an owner can read in two seconds.
- suggestedAction: one short imperative sentence for the owner (e.g. "Confirm the transfer arrived, then mark paid.").
- confidence: 0 to 1. Below 0.6 means a human must read it.
- Never invent dates. If a date is ambiguous (e.g. "the 15th" when today is the 20th), choose the next occurrence and lower confidence.`;

export async function classifyReply(
  input: ReplyClassifierInput,
): Promise<{ classification: ReplyClassification; meta: CallMeta }> {
  const prompt = [
    `Received on: ${input.receivedOn}`,
    `From: ${input.fromEmail}`,
    `Customer on file: ${input.customerName}`,
    `Invoice ${input.invoiceNumber}, ${input.amountFormatted} (${input.amountCents} cents), due ${input.dueAt}.`,
    input.lastTouchSubject ? `Our last email subject: "${input.lastTouchSubject}"` : "",
    "",
    "Reply text (verbatim, may include quoted history; judge the newest part):",
    "---",
    input.replyText.slice(0, 6000),
    "---",
  ]
    .join("\n")
    .trim();

  const { object, meta } = await generateStructured({
    name: "reply_classifier",
    promptVersion: REPLY_CLASSIFIER_PROMPT_VERSION,
    schema: ReplyClassificationSchema,
    instructions: INSTRUCTIONS,
    prompt,
    temperature: 0.1,
  });

  return { classification: object, meta };
}
