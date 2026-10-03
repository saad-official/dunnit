import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv, requireEnv } from "@/lib/env";
import type { Database } from "@/lib/db/database.types";

/**
 * Service-role client. Bypasses Row Level Security.
 * Use only in trusted server contexts: cron route handlers, Stripe webhooks,
 * inbound email webhooks. Never import from a component or a Server Action
 * that acts on behalf of a user.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    publicEnv.supabaseUrl,
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
