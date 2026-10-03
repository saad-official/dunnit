import { isAuthorizedCron, unauthorized } from "@/app/api/_lib/secrets";
import { runTick } from "@/lib/services/tick";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Scheduler heartbeat (spec 3.9). Called every 15 minutes by pg_cron + pg_net
 * with `Authorization: Bearer ${CRON_SECRET}`. Needs CRON_SECRET,
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and the model/email keys that
 * runTick uses. Returns the TickSummary.
 */
export const maxDuration = 120;

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();
  try {
    const summary = await runTick(createServiceClient(), new Date());
    console.info("[cron] tick", JSON.stringify({ ...summary, errors: summary.errors.length }));
    return Response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron] tick failed", message);
    return Response.json({ error: "tick failed", message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
