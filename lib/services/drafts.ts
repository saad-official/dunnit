import "server-only";
import { AiUnavailableError } from "@/lib/ai/generate";
import { logAgentEvent } from "@/lib/ai/log";
import { writeReminderDraft, type PriorReplySummary, type PriorTouchSummary } from "@/lib/ai/prompts/draft-writer";
import { toDomainCustomer, toDomainInvoice, toDomainOrganization, toDomainReply } from "@/lib/db/mappers";
import type { Cadence as CadenceRow, Touch as TouchRow } from "@/lib/db/types";
import { planCadence, shouldStop } from "@/lib/domain/cadence";
import { daysBetweenIsoDates, isoDateInZone } from "@/lib/domain/dates";
import { decideAutonomy, type AutonomyDecision } from "@/lib/domain/guardrails";
import { formatCents } from "@/lib/domain/money";
import { ensureCadence, nextPlannedStep } from "@/lib/services/cadences";
import { unwrap, type Client, type InvoiceBundle } from "@/lib/services/shared";

export type DraftResult =
  | { kind: "created"; touch: TouchRow; decision: AutonomyDecision }
  | { kind: "skipped"; reason: string };

export type DraftOptions = {
  /** Gentle follow-up after a promise-to-pay date passed; stored as step 0, tone check_in. */
  checkIn?: { promiseDate: string } | null;
  actor?: "cron" | "user" | "system";
};

/**
 * Drafts the next reminder for an invoice. The planner decides which step is
 * due; the model writes the words; guardrails and the autonomy policy decide
 * whether it waits for approval. Never sends.
 */
export async function createDraftForCadence(
  client: Client,
  bundle: InvoiceBundle & { cadence: CadenceRow },
  now: Date,
  options: DraftOptions = {},
): Promise<DraftResult> {
  const { org, invoice, customer, cadence } = bundle;
  const orgD = toDomainOrganization(org);
  const invoiceD = toDomainInvoice(invoice);
  const customerD = toDomainCustomer(customer);

  const stop = shouldStop(invoiceD, customerD);
  if (stop) {
    await ensureCadence(client, org, invoice, customer, now, cadence.step);
    return { kind: "skipped", reason: `blocked: ${stop}` };
  }

  const pending = await client
    .from("touches")
    .select("id")
    .eq("cadence_id", cadence.id)
    .in("status", ["draft", "approved", "snoozed"])
    .limit(1);
  if (pending.error) throw new Error(`check pending drafts: ${pending.error.message}`);
  if (pending.data.length > 0) return { kind: "skipped", reason: "a draft is already waiting" };

  const plan = planCadence(invoiceD, customerD, { timezone: orgD.timezone }, now);
  const next = nextPlannedStep(plan, cadence.step);
  if (!next && !options.checkIn) {
    await client.from("cadences").update({ status: "completed", next_run_at: null }).eq("id", cadence.id);
    return { kind: "skipped", reason: "ladder complete" };
  }

  const [touchesRes, repliesRes, rejectedRes] = await Promise.all([
    client
      .from("touches")
      .select("step, tone, sent_at, subject")
      .eq("invoice_id", invoice.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: true }),
    client.from("replies").select("*").eq("invoice_id", invoice.id).order("received_at", { ascending: true }),
    client
      .from("touches")
      .select("reject_reason")
      .eq("org_id", org.id)
      .eq("status", "rejected")
      .not("reject_reason", "is", null)
      .order("updated_at", { ascending: false })
      .limit(3),
  ]);
  if (touchesRes.error) throw new Error(`load touches: ${touchesRes.error.message}`);
  if (repliesRes.error) throw new Error(`load replies: ${repliesRes.error.message}`);

  const priorTouches: PriorTouchSummary[] = touchesRes.data
    .filter((t) => t.sent_at)
    .map((t) => ({
      step: t.step,
      tone: (t.tone === "check_in" || t.tone === "reply" ? "friendly" : t.tone) as PriorTouchSummary["tone"],
      sentAt: (t.sent_at as string).slice(0, 10),
      subject: t.subject,
    }));
  const priorReplies: PriorReplySummary[] = repliesRes.data
    .map(toDomainReply)
    .filter((r) => r.classification)
    .map((r) => ({
      receivedAt: r.receivedAt.toISOString().slice(0, 10),
      intent: r.classification!.intent,
      summary: r.classification!.summary,
    }));
  const rejectionReasons = (rejectedRes.data ?? [])
    .map((r) => r.reject_reason)
    .filter((r): r is string => Boolean(r));

  const today = isoDateInZone(now, orgD.timezone);
  const step = options.checkIn ? 1 : next!.step;
  const tone = options.checkIn ? "friendly" : next!.tone;

  let written;
  try {
    written = await writeReminderDraft({
      step,
      tone,
      businessName: orgD.voice.businessName,
      signature: orgD.voice.signature,
      toneNotes: orgD.voice.toneNotes,
      customerName: customerD.name,
      customerCompany: customerD.company,
      invoiceNumber: invoiceD.number,
      amountFormatted: formatCents(invoiceD.amountCents, invoiceD.currency),
      issuedAt: invoiceD.issuedAt,
      dueAt: invoiceD.dueAt,
      daysOverdue: Math.max(0, daysBetweenIsoDates(invoiceD.dueAt, today)),
      priorTouches,
      priorReplies,
      rejectionReasons,
      checkIn: options.checkIn ?? null,
    });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      await logAgentEvent(client, {
        orgId: org.id,
        actor: "system",
        type: "draft.unavailable",
        entityType: "invoice",
        entityId: invoice.id,
        output: { message: error.message },
      });
      return { kind: "skipped", reason: "no model provider configured" };
    }
    throw error;
  }

  const decision: AutonomyDecision = options.checkIn
    ? "needs_approval"
    : decideAutonomy(orgD, step, written.draft.confidence, customerD);

  const touch = unwrap(
    await client
      .from("touches")
      .insert({
        org_id: org.id,
        invoice_id: invoice.id,
        cadence_id: cadence.id,
        step: options.checkIn ? 0 : step,
        tone: options.checkIn ? "check_in" : tone,
        subject: written.draft.subject,
        body: written.draft.body,
        status: decision === "auto_send" ? "approved" : "draft",
        confidence: written.draft.confidence,
        rationale: written.draft.rationale,
        approved_at: decision === "auto_send" ? now.toISOString() : null,
      })
      .select()
      .single(),
    "insert touch",
  );

  await logAgentEvent(client, {
    orgId: org.id,
    actor: options.actor ?? "cron",
    type: "draft.created",
    entityType: "touch",
    entityId: touch.id,
    input: { invoiceId: invoice.id, step, tone, checkIn: options.checkIn ?? null },
    output: {
      decision,
      confidence: written.draft.confidence,
      violations: written.validation.violations.map((v) => v.code),
    },
    meta: written.meta,
  });

  return { kind: "created", touch, decision };
}
