/**
 * Row-level aliases for the database types. These are the raw Postgres shapes
 * (snake_case, timestamps as ISO strings). The camelCase domain models used by
 * the pure logic in lib/domain are separate; map between them at the edge.
 */
import type {
  Database,
  Enums,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/db/database.types";

export type { Database, Json } from "@/lib/db/database.types";

export type Organization = Tables<"organizations">;
export type Membership = Tables<"memberships">;
export type Customer = Tables<"customers">;
export type Invoice = Tables<"invoices">;
export type Cadence = Tables<"cadences">;
export type Touch = Tables<"touches">;
export type Reply = Tables<"replies">;
export type OutboxItem = Tables<"outbox">;
export type AgentEvent = Tables<"agent_events">;
export type InvoiceOverview = Tables<"invoice_overview">;

export type OrganizationUpdate = TablesUpdate<"organizations">;
export type CustomerInsert = TablesInsert<"customers">;
export type CustomerUpdate = TablesUpdate<"customers">;
export type InvoiceInsert = TablesInsert<"invoices">;
export type InvoiceUpdate = TablesUpdate<"invoices">;
export type CadenceInsert = TablesInsert<"cadences">;
export type CadenceUpdate = TablesUpdate<"cadences">;
export type TouchInsert = TablesInsert<"touches">;
export type TouchUpdate = TablesUpdate<"touches">;
export type ReplyInsert = TablesInsert<"replies">;
export type ReplyUpdate = TablesUpdate<"replies">;
export type OutboxInsert = TablesInsert<"outbox">;
export type AgentEventInsert = TablesInsert<"agent_events">;

export type Plan = Enums<"plan">;
export type Autonomy = Enums<"autonomy">;
export type InvoiceStatus = Enums<"invoice_status">;
export type CadenceStatus = Enums<"cadence_status">;
export type TouchStatus = Enums<"touch_status">;
export type TouchTone = Enums<"touch_tone">;
export type ReplyIntent = Enums<"reply_intent">;

/*
 * Text columns guarded by CHECK constraints. Generated types widen these to
 * `string`; the unions below mirror the constraints for code that wants them.
 */
export type MembershipRole = "owner" | "member";
export type InvoiceSource = "manual" | "csv" | "demo" | "stripe";
export type ContactFlag = "none" | "wrong_contact" | "bounced" | "unsubscribed";
export type OutboxProvider = "outbox" | "resend";
export type OutboxStatus = "queued" | "sent" | "delivered" | "failed";
export type AgentEventActor = "agent" | "user" | "system" | "cron" | "webhook";

/** Shape of organizations.voice (jsonb). Every key is optional in storage. */
export type OrgVoiceJson = {
  business_name?: string;
  signature?: string;
  tone_notes?: string;
};

export type PublicSchema = Database["public"];
