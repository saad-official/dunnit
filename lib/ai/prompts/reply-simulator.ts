import "server-only";
import { z } from "zod";
import { generateStructured, type CallMeta } from "@/lib/ai/generate";
import { REPLY_INTENTS, type ReplyIntent } from "@/lib/domain/types";

export const REPLY_SIMULATOR_PROMPT_VERSION = "reply-simulator/v1";

/**
 * Demo-only helper. Writes a plausible customer reply to a reminder so the
 * demo inbox can exercise the classifier without a real mailbox. Every
 * simulated reply is stored with `simulated = true` and labelled in the UI.
 */
export const SimulatedReplySchema = z.object({
  text: z.string().min(10),
  /** The intent the simulator was aiming for; used to show "expected vs classified". */
  intendedIntent: z.enum(REPLY_INTENTS),
});
export type SimulatedReply = z.infer<typeof SimulatedReplySchema>;

export type ReplySimulatorInput = {
  customerName: string;
  customerCompany?: string | null;
  invoiceNumber: string;
  amountFormatted: string;
  dueAt: string;
  reminderSubject: string;
  reminderBody: string;
  /** Pick a persona, or leave undefined for a random realistic one. */
  intent?: ReplyIntent;
  /** Today's date (ISO) so promised dates are plausible. */
  today: string;
};

const INSTRUCTIONS = `You role-play a small-business customer replying to a payment reminder email.
Write a realistic, short reply (1 to 4 sentences) in that customer's voice. Vary register: some customers are terse, some apologetic, some annoyed. Include realistic specifics (a date, a reason, a question) when the intent calls for it. Do not include a subject line or a signature block longer than a name. Never include markdown.`;

export async function simulateReply(
  input: ReplySimulatorInput,
): Promise<{ reply: SimulatedReply; meta: CallMeta }> {
  const intent = input.intent ?? pickWeightedIntent();
  const prompt = [
    `Today: ${input.today}`,
    `You are ${input.customerName}${input.customerCompany ? ` from ${input.customerCompany}` : ""}.`,
    `You received this reminder about invoice ${input.invoiceNumber} for ${input.amountFormatted}, due ${input.dueAt}:`,
    `Subject: ${input.reminderSubject}`,
    input.reminderBody,
    "",
    `Reply with the intent "${intent}". Set intendedIntent to exactly "${intent}".`,
  ].join("\n");

  const { object, meta } = await generateStructured({
    name: "reply_simulator",
    promptVersion: REPLY_SIMULATOR_PROMPT_VERSION,
    schema: SimulatedReplySchema,
    instructions: INSTRUCTIONS,
    prompt,
    temperature: 0.9,
  });
  return { reply: object, meta };
}

/** Realistic distribution: most replies are promises or payments, few disputes. */
function pickWeightedIntent(): ReplyIntent {
  const weights: Array<[ReplyIntent, number]> = [
    ["promise_to_pay", 35],
    ["paid", 25],
    ["question", 15],
    ["dispute", 8],
    ["out_of_office", 8],
    ["wrong_contact", 5],
    ["other", 3],
    ["unsubscribe", 1],
  ];
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [intent, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return intent;
  }
  return "promise_to_pay";
}
