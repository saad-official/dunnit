"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiUnavailableError } from "@/lib/ai/generate";
import { logAgentEvent } from "@/lib/ai/log";
import { simulateReply } from "@/lib/ai/prompts/reply-simulator";
import { requireOrgContext, type OrgContext } from "@/lib/db/queries";
import { isoDateInZone } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import type { ReplyOutcome } from "@/lib/domain/replies";
import { REPLY_INTENTS, type ReplyIntent } from "@/lib/domain/types";
import { markInvoicePaid } from "@/lib/services/invoices";
import { ingestReply, markReplyHandled, resumeCadence, type IngestReplyResult } from "@/lib/services/replies";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { DemoReplyResult, InboxActionError, InboxSimpleResult } from "@/components/inbox/types";

/*
 * Inbox Server Actions.
 *
 * Every action calls requireOrgContext() first, then confirms the target
 * reply or invoice is in ctx.org.id using the per-request client (RLS
 * applies). Owner task actions write with that same client. The service
 * client is created only after those checks, and only for ingestReply.
 */

type UserClient = Awaited<ReturnType<typeof createClient>>;

const Id = z.uuid();
const AI_UNAVAILABLE_MESSAGE =
  "Dunnit can't reach a language model right now: no GROQ_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is set. Paste a reply instead; it is stored and paused for your review.";

function fail(error: unknown, fallback = "Something went wrong."): InboxActionError {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
  return { ok: false, error: message || fallback };
}

function revalidateInboxViews() {
  revalidatePath("/inbox");
  revalidatePath("/dashboard");
  revalidatePath("/invoices");
  revalidatePath("/queue");
}

/** Loads a reply through RLS and checks it belongs to the caller's org. */
async function authoriseReply(supabase: UserClient, ctx: OrgContext, replyId: string) {
  const { data, error } = await supabase
    .from("replies")
    .select("id, org_id, invoice_id, handled")
    .eq("id", replyId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the reply: ${error.message}`);
  if (!data) throw new Error("That reply no longer exists in your organization.");
  return data;
}

/** Loads an invoice (with its customer) through RLS and checks it belongs to the caller's org. */
async function authoriseInvoice(supabase: UserClient, ctx: OrgContext, invoiceId: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, org_id, number, amount_cents, currency, due_at, status, customers(name, email, company)")
    .eq("id", invoiceId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the invoice: ${error.message}`);
  if (!data || !data.customers) throw new Error("That invoice no longer exists in your organization.");
  return { ...data, customer: data.customers };
}

async function lastSentTouch(supabase: UserClient, ctx: OrgContext, invoiceId: string) {
  const { data, error } = await supabase
    .from("touches")
    .select("id, subject, body")
    .eq("org_id", ctx.org.id)
    .eq("invoice_id", invoiceId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load the last reminder: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Owner tasks
// ---------------------------------------------------------------------------

export async function markReplyHandledAction(replyId: string): Promise<InboxSimpleResult> {
  const ctx = await requireOrgContext();
  const id = Id.safeParse(replyId);
  if (!id.success) return { ok: false, error: "Unknown reply.", code: "invalid" };

  try {
    const supabase = await createClient();
    const reply = await authoriseReply(supabase, ctx, id.data);
    if (reply.handled) return { ok: true, message: "Already marked handled." };
    await markReplyHandled(supabase, reply.id, ctx.user.id);
    return { ok: true, message: "Marked handled." };
  } catch (error) {
    return fail(error);
  } finally {
    revalidateInboxViews();
  }
}

export async function resumeCadenceAction(replyId: string): Promise<InboxSimpleResult> {
  const ctx = await requireOrgContext();
  const id = Id.safeParse(replyId);
  if (!id.success) return { ok: false, error: "Unknown reply.", code: "invalid" };

  try {
    const supabase = await createClient();
    const reply = await authoriseReply(supabase, ctx, id.data);
    await authoriseInvoice(supabase, ctx, reply.invoice_id);
    const cadence = await resumeCadence(supabase, reply.invoice_id);
    const message =
      cadence.status === "active"
        ? "Cadence resumed. The next reminder is drafted when it comes due."
        : cadence.status === "completed"
          ? "Nothing left to resume: every reminder step has already gone out."
          : "The cadence stays paused because the invoice or customer blocks chasing.";
    return { ok: true, message };
  } catch (error) {
    return fail(error);
  } finally {
    revalidateInboxViews();
  }
}

/** confirm_payment task: closes the invoice, stops its cadence, and marks the reply handled. */
export async function markInvoicePaidAction(replyId: string): Promise<InboxSimpleResult> {
  const ctx = await requireOrgContext();
  const id = Id.safeParse(replyId);
  if (!id.success) return { ok: false, error: "Unknown reply.", code: "invalid" };

  try {
    const supabase = await createClient();
    const reply = await authoriseReply(supabase, ctx, id.data);
    const invoice = await authoriseInvoice(supabase, ctx, reply.invoice_id);
    if (invoice.status !== "paid") await markInvoicePaid(supabase, invoice.id);
    if (!reply.handled) await markReplyHandled(supabase, reply.id, ctx.user.id);
    return { ok: true, message: `Invoice ${invoice.number} marked paid. Chasing stopped.` };
  } catch (error) {
    return fail(error);
  } finally {
    revalidateInboxViews();
  }
}

// ---------------------------------------------------------------------------
// Demo inbox
// ---------------------------------------------------------------------------

const PasteSchema = z.object({
  invoiceId: z.uuid({ error: "Choose an invoice." }),
  rawText: z
    .string()
    .trim()
    .min(3, { error: "Paste the customer's reply." })
    .max(5000, { error: "Keep the reply under 5,000 characters." }),
});

/** Demo inbox: paste a reply as if the customer had answered the last reminder. */
export async function submitDemoReply(input: { invoiceId: string; rawText: string }): Promise<DemoReplyResult> {
  const ctx = await requireOrgContext();
  const parsed = PasteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the reply.", code: "invalid" };
  }

  try {
    const supabase = await createClient();
    const invoice = await authoriseInvoice(supabase, ctx, parsed.data.invoiceId);
    const touch = await lastSentTouch(supabase, ctx, invoice.id);
    if (!touch) {
      return { ok: false, error: "Send at least one reminder for this invoice first.", code: "invalid" };
    }

    const result = await ingestReply(createServiceClient(), {
      invoiceId: invoice.id,
      touchId: touch.id,
      fromEmail: invoice.customer.email,
      rawText: parsed.data.rawText,
      simulated: true,
      actor: "user",
    });
    return toDemoResult(result, null, ctx.org.timezone || "UTC");
  } catch (error) {
    return fail(error);
  } finally {
    revalidateInboxViews();
  }
}

const SimulateSchema = z.object({
  invoiceId: z.uuid({ error: "Choose an invoice." }),
  intent: z.enum(REPLY_INTENTS).nullish(),
});

/** Demo inbox: the model writes a plausible customer reply, which is then ingested like a real one. */
export async function simulateDemoReply(input: {
  invoiceId: string;
  intent?: string | null;
}): Promise<DemoReplyResult> {
  const ctx = await requireOrgContext();
  const parsed = SimulateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Choose an invoice.", code: "invalid" };
  }

  try {
    const supabase = await createClient();
    const invoice = await authoriseInvoice(supabase, ctx, parsed.data.invoiceId);
    const touch = await lastSentTouch(supabase, ctx, invoice.id);
    if (!touch) {
      return { ok: false, error: "Send at least one reminder for this invoice first.", code: "invalid" };
    }

    let simulated;
    try {
      simulated = await simulateReply({
        customerName: invoice.customer.name,
        customerCompany: invoice.customer.company,
        invoiceNumber: invoice.number,
        amountFormatted: formatCents(invoice.amount_cents, invoice.currency),
        dueAt: invoice.due_at,
        reminderSubject: touch.subject,
        reminderBody: touch.body,
        intent: parsed.data.intent ?? undefined,
        today: isoDateInZone(new Date(), ctx.org.timezone || "UTC"),
      });
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        return { ok: false, error: AI_UNAVAILABLE_MESSAGE, code: "ai_unavailable" };
      }
      throw error;
    }

    await logAgentEvent(supabase, {
      orgId: ctx.org.id,
      actor: "user",
      type: "reply.simulated",
      entityType: "invoice",
      entityId: invoice.id,
      input: { requestedIntent: parsed.data.intent ?? null },
      output: { intendedIntent: simulated.reply.intendedIntent },
      meta: simulated.meta,
    });

    const result = await ingestReply(createServiceClient(), {
      invoiceId: invoice.id,
      touchId: touch.id,
      fromEmail: invoice.customer.email,
      rawText: simulated.reply.text,
      simulated: true,
      actor: "user",
    });
    return toDemoResult(result, simulated.reply.intendedIntent, ctx.org.timezone || "UTC");
  } catch (error) {
    return fail(error);
  } finally {
    revalidateInboxViews();
  }
}

function toDemoResult(
  result: IngestReplyResult,
  intendedIntent: ReplyIntent | null,
  timezone: string,
): DemoReplyResult {
  return {
    ok: true,
    replyId: result.reply.id,
    text: result.reply.raw_text,
    intendedIntent,
    classification: result.classification,
    effects: describeEffects(result.outcome, result.classification === null, timezone),
    tasks: result.outcome?.tasks.map((t) => t.title) ?? [],
  };
}

const INVOICE_STATUS_COPY: Record<string, string> = {
  pending_verification: "Invoice moved to pending verification.",
  disputed: "Invoice marked disputed.",
  paid: "Invoice marked paid.",
  open: "Invoice reopened.",
};

function describeEffects(outcome: ReplyOutcome | null, unclassified: boolean, timezone: string): string[] {
  if (unclassified || !outcome) return ["Stored without a classification. Chasing is paused until you read it."];
  const effects: string[] = [];
  if (outcome.invoiceStatus) effects.push(INVOICE_STATUS_COPY[outcome.invoiceStatus] ?? `Invoice is now ${outcome.invoiceStatus}.`);
  const patch = outcome.cadencePatch;
  if (patch.status === "stopped") effects.push("Cadence stopped.");
  else if (patch.status === "paused" && patch.pausedUntil) {
    effects.push(`Cadence paused until ${formatDay(patch.pausedUntil, timezone)}, then a gentle check-in.`);
  } else if (patch.status === "paused") effects.push("Cadence paused until you handle the reply.");
  else if (patch.nextRunAt) effects.push(`Next reminder pushed to ${formatDay(patch.nextRunAt, timezone)}.`);
  if (outcome.customerPatch?.doNotContact) effects.push("Customer marked do-not-contact.");
  else if (outcome.customerPatch?.contactFlag === "wrong_contact") effects.push("Customer flagged as wrong contact.");
  if (effects.length === 0) effects.push("No changes needed.");
  return effects;
}

function formatDay(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
