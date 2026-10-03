"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAgentEvent } from "@/lib/ai/log";
import { parseVoice } from "@/lib/db/mappers";
import { requireOrgContext, type OrgContext } from "@/lib/db/queries";
import { BODY_MAX, SUBJECT_MAX, validateDraft, type ViolationCode } from "@/lib/domain/guardrails";
import { formatCents } from "@/lib/domain/money";
import { BULK_APPROVE_LIMIT, BULK_APPROVE_MIN_CONFIDENCE, loadQueue } from "@/lib/services/queue";
import { sendTouch, type SendOutcome } from "@/lib/services/sending";
import { runTickForOrg } from "@/lib/services/tick";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  ActionError,
  ApproveResult,
  BulkApproveResult,
  RunAgentResult,
  SendFeedback,
  SimpleResult,
} from "@/components/queue/types";

/*
 * Approval-queue Server Actions.
 *
 * Every action calls requireOrgContext() first, then confirms the target
 * touch is in ctx.org.id using the per-request client (RLS applies), then
 * writes with that same client. The service client is created only after
 * those checks, and only for sendTouch / runTickForOrg (members cannot write
 * the outbox table).
 */

const TouchId = z.uuid({ error: "Unknown draft." });
type UserClient = Awaited<ReturnType<typeof createClient>>;

/** Statuses a person can act on from the queue. */
const ACTIONABLE: Array<"draft" | "snoozed"> = ["draft", "snoozed"];

function isActionable(status: string): boolean {
  return status === "draft" || status === "snoozed";
}

function fail(error: unknown, fallback = "Something went wrong."): ActionError {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
  return { ok: false, error: message || fallback };
}

function revalidateQueueViews() {
  revalidatePath("/queue");
  revalidatePath("/outbox");
  revalidatePath("/dashboard");
  revalidatePath("/invoices");
}

/** Loads the touch through RLS and checks it belongs to the caller's org. */
async function authoriseTouch(supabase: UserClient, ctx: OrgContext, touchId: string) {
  const { data, error } = await supabase
    .from("touches")
    .select("id, org_id, status, invoice_id")
    .eq("id", touchId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the draft: ${error.message}`);
  if (!data) throw new Error("That draft no longer exists in your organization.");
  return data;
}

/** Turns a SendOutcome into toast copy that names where the email actually went. */
async function describeOutcome(supabase: UserClient, outcome: SendOutcome): Promise<SendFeedback> {
  if (!outcome.sent) {
    return { sent: false, title: "Approved, but not sent", description: humaniseReason(outcome.reason) };
  }
  // SendOutcome does not carry the provider, so read it back from the outbox row (RLS-scoped).
  const { data } = await supabase
    .from("outbox")
    .select("provider")
    .eq("touch_id", outcome.touchId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const provider = data?.provider ?? "outbox";

  if (provider === "outbox") {
    return {
      sent: true,
      title: "Stored in Outbox",
      description: `Addressed to ${outcome.deliveredTo}. Nothing left the app (demo mode).`,
    };
  }
  if (outcome.demo) {
    return {
      sent: true,
      title: `Delivered to ${outcome.deliveredTo} (demo)`,
      description: "Demo mode sends every email to the owner's inbox instead of the customer.",
    };
  }
  return { sent: true, title: `Sent to ${outcome.deliveredTo}`, description: "Delivered via Resend." };
}

function humaniseReason(reason: string): string {
  if (reason.startsWith("touch is ")) return `This draft is already ${reason.slice("touch is ".length)}.`;
  switch (reason) {
    case "paid":
      return "The invoice is already paid, so the draft was cancelled.";
    case "written_off":
      return "The invoice was written off, so the draft was cancelled.";
    case "do_not_contact":
      return "This customer asked not to be contacted, so the draft was cancelled.";
    default:
      return reason;
  }
}

/** Marks the touch approved (user client), then hands it to sendTouch (service client). */
async function approveAndSend(
  supabase: UserClient,
  ctx: OrgContext,
  touchId: string,
  edits?: { subject: string; body: string },
): Promise<SendFeedback> {
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("touches")
    .update({
      ...(edits ?? {}),
      status: "approved",
      approved_by: ctx.user.id,
      approved_at: now,
      snoozed_until: null,
    })
    .eq("id", touchId)
    .eq("org_id", ctx.org.id)
    .in("status", ACTIONABLE)
    .select("id");
  if (error) throw new Error(`Could not approve the draft: ${error.message}`);
  if (!updated || updated.length === 0) throw new Error("This draft was already handled.");

  await logAgentEvent(supabase, {
    orgId: ctx.org.id,
    actor: "user",
    type: edits ? "touch.edited_and_approved" : "touch.approved",
    entityType: "touch",
    entityId: touchId,
    input: { userId: ctx.user.id },
  });

  let outcome: SendOutcome;
  try {
    outcome = await sendTouch(createServiceClient(), touchId, { kind: "user", userId: ctx.user.id });
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : String(sendError);
    return {
      sent: false,
      title: "Approved; sending will retry",
      description: `The send step failed (${message}). The agent retries approved drafts on its next run.`,
    };
  }
  return describeOutcome(supabase, outcome);
}

export async function approveTouch(touchId: string): Promise<ApproveResult> {
  const ctx = await requireOrgContext();
  const id = TouchId.safeParse(touchId);
  if (!id.success) return { ok: false, error: "Unknown draft." };

  try {
    const supabase = await createClient();
    const touch = await authoriseTouch(supabase, ctx, id.data);
    if (!isActionable(touch.status)) return { ok: false, error: `This draft is already ${touch.status}.` };
    const feedback = await approveAndSend(supabase, ctx, touch.id);
    return { ok: true, feedback };
  } catch (error) {
    return fail(error);
  } finally {
    revalidateQueueViews();
  }
}

const EditSchema = z.object({
  touchId: TouchId,
  subject: z
    .string()
    .trim()
    .min(1, { error: "Add a subject." })
    .max(SUBJECT_MAX, { error: `Keep the subject under ${SUBJECT_MAX} characters.` }),
  body: z
    .string()
    .trim()
    .min(1, { error: "The email body is empty." })
    .max(BODY_MAX, { error: `Keep the body under ${BODY_MAX} characters.` }),
});

/** Guardrail failures that block even an owner-edited email; the others are advisory. */
const BLOCKING_VIOLATIONS: ReadonlySet<ViolationCode> = new Set(["placeholder", "banned_phrase"]);

export async function saveAndSendTouch(input: {
  touchId: string;
  subject: string;
  body: string;
}): Promise<ApproveResult> {
  const ctx = await requireOrgContext();
  const parsed = EditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the subject and body." };
  }
  const { touchId, subject, body } = parsed.data;

  try {
    const supabase = await createClient();
    const touch = await authoriseTouch(supabase, ctx, touchId);
    if (!isActionable(touch.status)) return { ok: false, error: `This draft is already ${touch.status}.` };

    const { data: invoice } = await supabase
      .from("invoices")
      .select("number, amount_cents, currency, customers(name)")
      .eq("id", touch.invoice_id)
      .eq("org_id", ctx.org.id)
      .maybeSingle();
    if (invoice) {
      const check = validateDraft(
        { subject, body, confidence: 1, rationale: "" },
        {
          invoiceNumber: invoice.number,
          amountFormatted: formatCents(invoice.amount_cents, invoice.currency),
          customerName: invoice.customers?.name ?? "",
          signature: parseVoice(ctx.org).signature,
        },
      );
      const blocking = check.violations.filter((v) => BLOCKING_VIOLATIONS.has(v.code));
      if (blocking.length > 0) {
        return {
          ok: false,
          error: "This email can't be sent as written.",
          details: blocking.map((v) => v.message),
        };
      }
    }

    const feedback = await approveAndSend(supabase, ctx, touch.id, { subject, body });
    return { ok: true, feedback };
  } catch (error) {
    return fail(error);
  } finally {
    revalidateQueueViews();
  }
}

const RejectSchema = z.object({
  touchId: TouchId,
  reason: z
    .string()
    .trim()
    .min(3, { error: "Say briefly why, so the next draft is better." })
    .max(500, { error: "Keep the reason under 500 characters." }),
});

export async function rejectTouch(input: { touchId: string; reason: string }): Promise<SimpleResult> {
  const ctx = await requireOrgContext();
  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Add a reason." };

  try {
    const supabase = await createClient();
    const touch = await authoriseTouch(supabase, ctx, parsed.data.touchId);
    const { data: updated, error } = await supabase
      .from("touches")
      .update({ status: "rejected", reject_reason: parsed.data.reason, snoozed_until: null })
      .eq("id", touch.id)
      .eq("org_id", ctx.org.id)
      .in("status", ACTIONABLE)
      .select("id");
    if (error) throw new Error(`Could not reject the draft: ${error.message}`);
    if (!updated || updated.length === 0) return { ok: false, error: "This draft was already handled." };

    await logAgentEvent(supabase, {
      orgId: ctx.org.id,
      actor: "user",
      type: "touch.rejected",
      entityType: "touch",
      entityId: touch.id,
      input: { userId: ctx.user.id, reason: parsed.data.reason },
    });
    return { ok: true, message: "Draft rejected. The next draft will take your reason into account." };
  } catch (error) {
    return fail(error);
  } finally {
    revalidatePath("/queue");
  }
}

const SnoozeSchema = z.object({ touchId: TouchId, days: z.union([z.literal(1), z.literal(3)]) });

export async function snoozeTouch(input: { touchId: string; days: 1 | 3 }): Promise<SimpleResult> {
  const ctx = await requireOrgContext();
  const parsed = SnoozeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose 1 or 3 days." };

  try {
    const supabase = await createClient();
    const touch = await authoriseTouch(supabase, ctx, parsed.data.touchId);
    const until = new Date(Date.now() + parsed.data.days * 86_400_000);
    const { data: updated, error } = await supabase
      .from("touches")
      .update({ status: "snoozed", snoozed_until: until.toISOString() })
      .eq("id", touch.id)
      .eq("org_id", ctx.org.id)
      .in("status", ACTIONABLE)
      .select("id");
    if (error) throw new Error(`Could not snooze the draft: ${error.message}`);
    if (!updated || updated.length === 0) return { ok: false, error: "This draft was already handled." };

    await logAgentEvent(supabase, {
      orgId: ctx.org.id,
      actor: "user",
      type: "touch.snoozed",
      entityType: "touch",
      entityId: touch.id,
      input: { userId: ctx.user.id, until: until.toISOString() },
    });
    const label = parsed.data.days === 1 ? "tomorrow" : "in 3 days";
    return { ok: true, message: `Snoozed. It comes back ${label}.` };
  } catch (error) {
    return fail(error);
  } finally {
    revalidatePath("/queue");
  }
}

/**
 * Approves and sends every waiting draft with confidence >= 80%. The set is
 * recomputed here from the org's queue through RLS, never taken from the client.
 */
export async function approveAllConfident(): Promise<BulkApproveResult> {
  const ctx = await requireOrgContext();
  try {
    const supabase = await createClient();
    const queue = await loadQueue(supabase, ctx.org);
    const eligible = queue
      .filter((item) => item.confidence >= BULK_APPROVE_MIN_CONFIDENCE)
      .slice(0, BULK_APPROVE_LIMIT);

    let approved = 0;
    let sent = 0;
    let notSent = 0;
    const failures: string[] = [];
    for (const item of eligible) {
      try {
        const feedback = await approveAndSend(supabase, ctx, item.id);
        approved++;
        if (feedback.sent) {
          sent++;
        } else {
          notSent++;
          failures.push(`Invoice ${item.invoice.number}: ${feedback.description ?? feedback.title}`);
        }
      } catch (error) {
        failures.push(`Invoice ${item.invoice.number}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { ok: true, approved, sent, notSent, failures };
  } catch (error) {
    return fail(error);
  } finally {
    revalidateQueueViews();
  }
}

/** "Run agent now": drafts due steps and sends approved touches for this org only. */
export async function runAgentNow(): Promise<RunAgentResult> {
  const ctx = await requireOrgContext();
  try {
    const summary = await runTickForOrg(createServiceClient(), ctx.org.id);
    return {
      ok: true,
      drafted: summary.drafted + summary.checkIns,
      sent: summary.sent,
      skipped: summary.skipped,
      errors: summary.errors,
      durationMs: summary.durationMs,
    };
  } catch (error) {
    return fail(error);
  } finally {
    revalidateQueueViews();
  }
}
