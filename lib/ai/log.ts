import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/database.types";
import type { CallMeta } from "@/lib/ai/generate";

type AgentEventInsert = Database["public"]["Tables"]["agent_events"]["Insert"];
export type Actor = "agent" | "user" | "system" | "cron" | "webhook";

export type AgentEventInput = {
  orgId: string;
  actor: Actor;
  /** Short dotted name, e.g. "draft.created", "touch.approved", "reply.classified". */
  type: string;
  entityType?: "invoice" | "touch" | "reply" | "cadence" | "customer" | "organization";
  entityId?: string | null;
  input?: Json;
  output?: Json;
  /** When the event wraps a model call, attach its metadata. */
  meta?: CallMeta;
};

/**
 * Append-only audit trail. The table rejects UPDATE and DELETE at the
 * database level, so this is the only write path.
 * Accepts either the per-request client (user actions) or the service client
 * (cron, webhooks). Logging must never break the main flow: errors are
 * reported to console and swallowed.
 */
export async function logAgentEvent(
  client: SupabaseClient<Database>,
  event: AgentEventInput,
): Promise<void> {
  const row: AgentEventInsert = {
    org_id: event.orgId,
    actor: event.actor,
    type: event.type,
    entity_type: event.entityType ?? null,
    entity_id: event.entityId ?? null,
    input: event.input ?? null,
    output: event.output ?? null,
    model: event.meta?.model ?? null,
    prompt_version: event.meta?.promptVersion ?? null,
    tokens_in: event.meta?.tokensIn ?? null,
    tokens_out: event.meta?.tokensOut ?? null,
    latency_ms: event.meta?.latencyMs ?? null,
  };
  const { error } = await client.from("agent_events").insert(row);
  if (error) {
    console.error("[agent_events] insert failed", error.message, event.type);
  }
}
