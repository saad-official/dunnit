import "server-only";
import { logAgentEvent } from "@/lib/ai/log";
import { isoDateInZone } from "@/lib/domain/dates";
import { MS_PER_DAY } from "@/lib/domain/dates";
import { PAUSE_REASONS } from "@/lib/domain/replies";
import { createDraftForCadence } from "@/lib/services/drafts";
import { sendTouch } from "@/lib/services/sending";
import { loadInvoiceBundle, type Client } from "@/lib/services/shared";

export type TickSummary = {
  resumed: number;
  checkIns: number;
  drafted: number;
  skipped: number;
  sent: number;
  errors: string[];
  durationMs: number;
};

/** Groq free tier is 30 requests/minute; keep each tick well under it. */
const MAX_DRAFTS_PER_TICK = 15;
const MAX_SENDS_PER_TICK = 25;

/**
 * The scheduler's heartbeat (every 15 minutes via pg_cron → /api/cron/tick).
 * 1. Resume cadences whose timed pause has ended (promise-to-pay → check-in draft).
 * 2. Draft the next step for cadences that are due.
 * 3. Send touches that were approved (by a person or by the autonomy policy).
 */
export async function runTick(client: Client, now = new Date()): Promise<TickSummary> {
  const started = Date.now();
  const summary: TickSummary = { resumed: 0, checkIns: 0, drafted: 0, skipped: 0, sent: 0, errors: [], durationMs: 0 };

  // 1. Expired pauses
  const expired = await client
    .from("cadences")
    .select("*")
    .eq("status", "paused")
    .not("paused_until", "is", null)
    .lte("paused_until", now.toISOString())
    .limit(50);
  if (expired.error) summary.errors.push(`load expired pauses: ${expired.error.message}`);

  for (const cadence of expired.data ?? []) {
    try {
      const bundle = await loadInvoiceBundle(client, cadence.invoice_id);
      if (cadence.pause_reason === PAUSE_REASONS.promise_to_pay && summary.checkIns + summary.drafted < MAX_DRAFTS_PER_TICK) {
        const tz = bundle.org.timezone || "UTC";
        const promiseDate = isoDateInZone(new Date(new Date(cadence.paused_until as string).getTime() - MS_PER_DAY), tz);
        const result = await createDraftForCadence(client, { ...bundle, cadence }, now, {
          checkIn: { promiseDate },
          actor: "cron",
        });
        if (result.kind === "created") summary.checkIns++;
        else summary.skipped++;
      }
      const nextRun = cadence.next_run_at && new Date(cadence.next_run_at) > now ? cadence.next_run_at : now.toISOString();
      await client
        .from("cadences")
        .update({ status: "active", paused_until: null, pause_reason: null, next_run_at: nextRun })
        .eq("id", cadence.id);
      summary.resumed++;
    } catch (error) {
      summary.errors.push(`resume ${cadence.id}: ${message(error)}`);
    }
  }

  // 2. Due cadences
  const due = await client
    .from("cadences")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(MAX_DRAFTS_PER_TICK * 2);
  if (due.error) summary.errors.push(`load due cadences: ${due.error.message}`);

  for (const cadence of due.data ?? []) {
    if (summary.drafted + summary.checkIns >= MAX_DRAFTS_PER_TICK) break;
    try {
      const bundle = await loadInvoiceBundle(client, cadence.invoice_id);
      const result = await createDraftForCadence(client, { ...bundle, cadence }, now, { actor: "cron" });
      if (result.kind === "created") summary.drafted++;
      else summary.skipped++;
    } catch (error) {
      summary.errors.push(`draft ${cadence.id}: ${message(error)}`);
    }
  }

  // 3. Approved, unsent touches
  const approved = await client
    .from("touches")
    .select("id")
    .eq("status", "approved")
    .is("sent_at", null)
    .order("approved_at", { ascending: true })
    .limit(MAX_SENDS_PER_TICK);
  if (approved.error) summary.errors.push(`load approved touches: ${approved.error.message}`);

  for (const touch of approved.data ?? []) {
    try {
      const outcome = await sendTouch(client, touch.id, { kind: "cron" }, now);
      if (outcome.sent) summary.sent++;
      else summary.skipped++;
    } catch (error) {
      summary.errors.push(`send ${touch.id}: ${message(error)}`);
    }
  }

  summary.durationMs = Date.now() - started;
  return summary;
}

/** Same as runTick but scoped to one organisation (used by the in-app "Run agent now" button). */
export async function runTickForOrg(client: Client, orgId: string, now = new Date()): Promise<TickSummary> {
  const started = Date.now();
  const summary: TickSummary = { resumed: 0, checkIns: 0, drafted: 0, skipped: 0, sent: 0, errors: [], durationMs: 0 };

  const due = await client
    .from("cadences")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "active")
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(MAX_DRAFTS_PER_TICK);
  for (const cadence of due.data ?? []) {
    try {
      const bundle = await loadInvoiceBundle(client, cadence.invoice_id);
      const result = await createDraftForCadence(client, { ...bundle, cadence }, now, { actor: "user" });
      if (result.kind === "created") summary.drafted++;
      else summary.skipped++;
    } catch (error) {
      summary.errors.push(`draft ${cadence.id}: ${message(error)}`);
    }
  }

  const approved = await client
    .from("touches")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .is("sent_at", null)
    .limit(MAX_SENDS_PER_TICK);
  for (const touch of approved.data ?? []) {
    try {
      const outcome = await sendTouch(client, touch.id, { kind: "user" }, now);
      if (outcome.sent) summary.sent++;
      else summary.skipped++;
    } catch (error) {
      summary.errors.push(`send ${touch.id}: ${message(error)}`);
    }
  }

  summary.durationMs = Date.now() - started;
  await logAgentEvent(client, {
    orgId,
    actor: "user",
    type: "agent.run",
    output: { ...summary },
  });
  return summary;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
