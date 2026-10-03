import "server-only";
import type { Touch as TouchRow, TouchTone } from "@/lib/db/types";
import { daysBetweenIsoDates, isoDateInZone } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import type { Client } from "@/lib/services/shared";

/** Drafts at or above this confidence are offered for one-click bulk approval. */
export const BULK_APPROVE_MIN_CONFIDENCE = 0.8;

/** Upper bound for one bulk approval, so a single click cannot run for minutes. */
export const BULK_APPROVE_LIMIT = 20;

/** Plain, serialisable shape the queue UI renders (safe to pass to Client Components). */
export type QueueItem = {
  id: string;
  status: TouchRow["status"];
  step: number;
  tone: TouchTone;
  subject: string;
  body: string;
  confidence: number;
  rationale: string | null;
  createdAt: string;
  invoice: {
    id: string;
    number: string;
    amountCents: number;
    currency: string;
    amountFormatted: string;
    dueAt: string;
  };
  customer: { name: string; email: string; company: string | null };
  /** Positive when overdue, 0 on the due date, negative before it (org timezone). */
  daysOverdue: number;
};

const QUEUE_SELECT =
  "id, status, step, tone, subject, body, confidence, rationale, created_at, snoozed_until, invoices(id, number, amount_cents, currency, due_at, customers(name, email, company))" as const;

/**
 * Touches waiting for a decision, oldest first: status 'draft' (not snoozed
 * into the future) plus 'snoozed' whose snoozed_until has passed. Pass the
 * per-request client so RLS scopes rows; org_id is filtered explicitly too.
 */
export async function loadQueue(
  client: Client,
  org: { id: string; timezone: string | null },
  now = new Date(),
  limit = 100,
): Promise<QueueItem[]> {
  const nowIso = now.toISOString();
  const { data, error } = await client
    .from("touches")
    .select(QUEUE_SELECT)
    .eq("org_id", org.id)
    .in("status", ["draft", "snoozed"])
    .or(`snoozed_until.is.null,snoozed_until.lte."${nowIso}"`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`load queue: ${error.message}`);

  const today = isoDateInZone(now, org.timezone || "UTC");
  const items: QueueItem[] = [];
  for (const row of data ?? []) {
    const invoice = row.invoices;
    const customer = invoice?.customers;
    if (!invoice || !customer) continue;
    items.push({
      id: row.id,
      status: row.status,
      step: row.step,
      tone: row.tone,
      subject: row.subject,
      body: row.body,
      confidence: clampConfidence(row.confidence),
      rationale: row.rationale,
      createdAt: row.created_at,
      invoice: {
        id: invoice.id,
        number: invoice.number,
        amountCents: invoice.amount_cents,
        currency: invoice.currency,
        amountFormatted: safeFormatCents(invoice.amount_cents, invoice.currency),
        dueAt: invoice.due_at,
      },
      customer: { name: customer.name, email: customer.email, company: customer.company },
      daysOverdue: daysBetweenIsoDates(invoice.due_at, today),
    });
  }
  return items;
}

function clampConfidence(value: number | string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function safeFormatCents(cents: number, currency: string): string {
  try {
    return formatCents(cents, currency);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}
