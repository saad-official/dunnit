import { isAuthorizedCron, unauthorized } from "@/app/api/_lib/secrets";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Daily job (Vercel Cron, see vercel.json; Hobby allows one run per day).
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
 * Needs CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 *
 * Today it only runs a keep-alive query so the Supabase Free project is not
 * paused for inactivity.
 * TODO: weekly digest email for Pro orgs (spec 2, 3.9).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized();

  const at = new Date().toISOString();
  const { error } = await createServiceClient().from("organizations").select("id").limit(1);
  if (error) {
    console.error("[cron] daily keep-alive failed", error.message);
    return Response.json({ ok: false, at, error: error.message }, { status: 500 });
  }
  console.info("[cron] daily keep-alive ok", at);
  return Response.json({ ok: true, at });
}
