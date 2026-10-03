/**
 * Row (snake_case, ISO strings) → domain model (camelCase, Dates) mapping.
 * The pure logic in lib/domain never sees a database row.
 */
import type {
  Cadence as CadenceRow,
  Customer as CustomerRow,
  Invoice as InvoiceRow,
  Organization as OrganizationRow,
  OrgVoiceJson,
  Reply as ReplyRow,
  Touch as TouchRow,
} from "@/lib/db/types";
import {
  ReplyClassificationSchema,
  type Cadence,
  type Customer,
  type Invoice,
  type Organization,
  type OrgVoice,
  type Reply,
  type Tone,
  type Touch,
} from "@/lib/domain/types";

/** Sentinel for cadences with nothing scheduled (completed/stopped). */
export const FAR_FUTURE = new Date(8_640_000_000_000_000);

export function parseVoice(row: Pick<OrganizationRow, "name" | "voice">): OrgVoice {
  const v = (row.voice ?? {}) as OrgVoiceJson;
  return {
    businessName: v.business_name?.trim() || row.name,
    signature: v.signature?.trim() || `Thanks,\n${row.name}`,
    toneNotes: v.tone_notes?.trim() ?? "",
  };
}

export function toDomainOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone || "UTC",
    voice: parseVoice(row),
    autonomy: row.autonomy,
    plan: row.plan,
  };
}

export function toDomainCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    email: row.email,
    company: row.company ?? undefined,
    riskScore: row.risk_score,
    doNotContact: row.do_not_contact,
    contactFlag: row.contact_flag as Customer["contactFlag"],
  };
}

export function toDomainInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    orgId: row.org_id,
    customerId: row.customer_id,
    number: row.number,
    amountCents: row.amount_cents,
    currency: row.currency,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    status: row.status,
    paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
  };
}

export function toDomainCadence(row: CadenceRow): Cadence {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    step: clampStep(row.step),
    nextRunAt: row.next_run_at ? new Date(row.next_run_at) : FAR_FUTURE,
    status: row.status,
    pausedUntil: row.paused_until ? new Date(row.paused_until) : undefined,
    pauseReason: row.pause_reason ?? undefined,
  };
}

const LADDER_TONES: ReadonlySet<string> = new Set(["friendly", "firm", "formal", "final"]);

export function toDomainTouch(row: TouchRow): Touch {
  const step = row.step >= 1 && row.step <= 4 ? (row.step as 1 | 2 | 3 | 4) : 1;
  const tone: Tone = LADDER_TONES.has(row.tone) ? (row.tone as Tone) : "friendly";
  const status: Touch["status"] =
    row.status === "sent" || row.status === "draft" || row.status === "approved" || row.status === "rejected"
      ? row.status
      : row.status === "snoozed"
        ? "draft"
        : "skipped";
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    step,
    tone,
    subject: row.subject,
    body: row.body,
    status,
    confidence: Number(row.confidence),
    sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
  };
}

export function toDomainReply(row: ReplyRow): Reply {
  const parsed = ReplyClassificationSchema.safeParse(row.classification);
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    receivedAt: new Date(row.received_at),
    classification: parsed.success ? parsed.data : null,
    handled: row.handled,
  };
}

function clampStep(step: number): Cadence["step"] {
  if (step <= 0) return 0;
  if (step >= 4) return 4;
  return step as Cadence["step"];
}
