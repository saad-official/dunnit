import "server-only";
import { AiUnavailableError } from "@/lib/ai/generate";
import { logAgentEvent, type Actor } from "@/lib/ai/log";
import { classifyReply } from "@/lib/ai/prompts/reply-classifier";
import { toDomainCadence, toDomainInvoice } from "@/lib/db/mappers";
import type { Cadence as CadenceRow, Invoice as InvoiceRow, Reply as ReplyRow } from "@/lib/db/types";
import { isoDateInZone } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { handleReply, type CadencePatch, type ReplyOutcome, type ReplyTask } from "@/lib/domain/replies";
import { ReplyClassificationSchema, type ReplyClassification } from "@/lib/domain/types";
import { ensureCadence } from "@/lib/services/cadences";
import { loadInvoiceBundle, unwrap, type Client } from "@/lib/services/shared";

export type IngestReplyInput = {
  invoiceId: string;
  touchId?: string | null;
  fromEmail: string;
  rawText: string;
  simulated?: boolean;
  actor?: Actor;
};

export type IngestReplyResult = {
  reply: ReplyRow;
  classification: ReplyClassification | null;
  outcome: ReplyOutcome | null;
};

/**
 * Stores a reply, classifies it, and applies the deterministic outcome
 * (invoice status, cadence pause/stop, customer flags). Tasks are not
 * persisted: they are re-derived from the stored classification on render.
 */
export async function ingestReply(client: Client, input: IngestReplyInput, now = new Date()): Promise<IngestReplyResult> {
  const bundle = await loadInvoiceBundle(client, input.invoiceId);
  const { org, invoice, customer } = bundle;
  const cadence = bundle.cadence ?? (await ensureCadence(client, org, invoice, customer, now));
  const timezone = org.timezone || "UTC";

  const lastTouch = await client
    .from("touches")
    .select("id, subject")
    .eq("invoice_id", invoice.id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let classification: ReplyClassification | null = null;
  let meta;
  try {
    const result = await classifyReply({
      replyText: input.rawText,
      fromEmail: input.fromEmail,
      receivedOn: isoDateInZone(now, timezone),
      invoiceNumber: invoice.number,
      amountFormatted: formatCents(invoice.amount_cents, invoice.currency),
      amountCents: invoice.amount_cents,
      dueAt: invoice.due_at,
      customerName: customer.name,
      lastTouchSubject: lastTouch.data?.subject ?? null,
    });
    classification = result.classification;
    meta = result.meta;
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) throw error;
  }

  const reply = unwrap(
    await client
      .from("replies")
      .insert({
        org_id: org.id,
        invoice_id: invoice.id,
        touch_id: input.touchId ?? lastTouch.data?.id ?? null,
        from_email: input.fromEmail,
        raw_text: input.rawText,
        received_at: now.toISOString(),
        classification: classification ?? null,
        intent: classification?.intent ?? null,
        simulated: input.simulated ?? false,
      })
      .select()
      .single(),
    "insert reply",
  );

  await logAgentEvent(client, {
    orgId: org.id,
    actor: input.actor ?? "webhook",
    type: classification ? "reply.classified" : "reply.unclassified",
    entityType: "reply",
    entityId: reply.id,
    input: { invoiceId: invoice.id, simulated: input.simulated ?? false },
    output: classification ?? { message: "no model provider configured" },
    meta,
  });

  if (!classification) {
    // Pause chasing until a human reads it.
    await client
      .from("cadences")
      .update({ status: "paused", pause_reason: "reply_needs_review", paused_until: null })
      .eq("id", cadence.id)
      .in("status", ["active", "paused"]);
    return { reply, classification: null, outcome: null };
  }

  const outcome = handleReply(classification, toDomainInvoice(invoice), toDomainCadence(cadence), now, { timezone });
  await applyOutcome(client, { orgId: org.id, invoiceId: invoice.id, customerId: customer.id, cadenceId: cadence.id }, outcome);

  await logAgentEvent(client, {
    orgId: org.id,
    actor: "agent",
    type: "reply.handled",
    entityType: "reply",
    entityId: reply.id,
    output: {
      invoiceStatus: outcome.invoiceStatus ?? null,
      cadencePatch: serializeCadencePatch(outcome.cadencePatch),
      customerPatch: outcome.customerPatch ?? null,
      tasks: outcome.tasks.map((t) => t.type),
    },
  });

  return { reply, classification, outcome };
}

export async function applyOutcome(
  client: Client,
  ids: { orgId: string; invoiceId: string; customerId: string; cadenceId: string },
  outcome: ReplyOutcome,
) {
  if (outcome.invoiceStatus) {
    const { error } = await client.from("invoices").update({ status: outcome.invoiceStatus }).eq("id", ids.invoiceId);
    if (error) throw new Error(`update invoice status: ${error.message}`);
  }
  const patch = serializeCadencePatch(outcome.cadencePatch);
  if (Object.keys(patch).length > 0) {
    const { error } = await client.from("cadences").update(patch).eq("id", ids.cadenceId);
    if (error) throw new Error(`update cadence: ${error.message}`);
  }
  if (outcome.customerPatch) {
    const { error } = await client
      .from("customers")
      .update({
        ...(outcome.customerPatch.doNotContact !== undefined ? { do_not_contact: outcome.customerPatch.doNotContact } : {}),
        ...(outcome.customerPatch.contactFlag !== undefined ? { contact_flag: outcome.customerPatch.contactFlag } : {}),
      })
      .eq("id", ids.customerId);
    if (error) throw new Error(`update customer: ${error.message}`);
  }
}

export function serializeCadencePatch(patch: CadencePatch) {
  const out: {
    status?: CadenceRow["status"];
    next_run_at?: string;
    paused_until?: string | null;
    pause_reason?: string | null;
  } = {};
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.nextRunAt !== undefined) out.next_run_at = patch.nextRunAt.toISOString();
  if (patch.pausedUntil !== undefined) out.paused_until = patch.pausedUntil ? patch.pausedUntil.toISOString() : null;
  if (patch.pauseReason !== undefined) out.pause_reason = patch.pauseReason;
  return out;
}

/** Re-derives the owner tasks for a stored reply (pure; used by the Inbox). */
export function deriveReplyTasks(
  reply: ReplyRow,
  invoice: InvoiceRow,
  cadence: CadenceRow | null,
  now: Date,
  timezone: string,
): ReplyTask[] {
  const parsed = ReplyClassificationSchema.safeParse(reply.classification);
  if (!parsed.success) {
    return [
      {
        type: "review_reply",
        title: `Read reply on invoice ${invoice.number}`,
        detail: "The reply could not be classified automatically.",
      },
    ];
  }
  const cadenceD = cadence
    ? toDomainCadence(cadence)
    : { id: "none", invoiceId: invoice.id, step: 0 as const, nextRunAt: now, status: "completed" as const };
  return handleReply(parsed.data, toDomainInvoice(invoice), cadenceD, now, { timezone }).tasks;
}

/** Owner marks a reply as dealt with. Does not resume the cadence by itself. */
export async function markReplyHandled(client: Client, replyId: string, userId: string, now = new Date()) {
  const reply = unwrap(
    await client
      .from("replies")
      .update({ handled: true, handled_at: now.toISOString() })
      .eq("id", replyId)
      .select()
      .single(),
    "mark reply handled",
  );
  await logAgentEvent(client, {
    orgId: reply.org_id,
    actor: "user",
    type: "reply.marked_handled",
    entityType: "reply",
    entityId: reply.id,
    input: { userId },
  });
  return reply;
}

/** Owner resumes a paused cadence (e.g. after answering a question). */
export async function resumeCadence(client: Client, invoiceId: string, now = new Date()) {
  const bundle = await loadInvoiceBundle(client, invoiceId);
  const cadence = await ensureCadence(client, bundle.org, bundle.invoice, bundle.customer, now, bundle.cadence?.step ?? 0);
  await logAgentEvent(client, {
    orgId: bundle.org.id,
    actor: "user",
    type: "cadence.resumed",
    entityType: "cadence",
    entityId: cadence.id,
  });
  return cadence;
}
