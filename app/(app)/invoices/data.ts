import "server-only";
import { cache } from "react";
import type { CadenceStateInput } from "@/components/invoices/cadence";
import {
  daysOverdue,
  displayStatus,
  todayInZone,
  type DisplayStatus,
} from "@/components/invoices/format";
import type {
  AgentEvent,
  Cadence,
  Customer,
  Invoice,
  InvoiceStatus,
  Organization,
  Reply,
  Touch,
} from "@/lib/db/types";
import { getInvoiceCapacity, type InvoiceCapacity } from "@/lib/services/plan-limits";
import { createClient } from "@/lib/supabase/server";

export type InvoiceListItem = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  amountCents: number;
  currency: string;
  dueAt: string;
  status: InvoiceStatus;
  display: DisplayStatus;
  /** Days past due; only meaningful when display is "overdue". */
  overdueDays: number;
  cadence: CadenceStateInput | null;
  sentTouchCount: number;
};

export type CustomerOption = { id: string; name: string; email: string; company: string | null };

export type InvoiceListData = {
  items: InvoiceListItem[];
  now: Date;
  today: string;
  capacity: InvoiceCapacity;
  hasDemoData: boolean;
  customers: CustomerOption[];
};

/**
 * Everything the invoice list needs, scoped to the org. Reads the
 * invoice_overview view (customer, cadence and touch stats per invoice) plus
 * cadence pause reasons, which the view does not carry.
 */
export async function loadInvoiceList(org: Organization): Promise<InvoiceListData> {
  const supabase = await createClient();
  const now = new Date();
  const today = todayInZone(now, org.timezone || "UTC");

  const [overview, cadences, demo, customers, capacity] = await Promise.all([
    supabase.from("invoice_overview").select("*").eq("org_id", org.id),
    supabase.from("cadences").select("invoice_id, pause_reason").eq("org_id", org.id),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("source", "demo"),
    supabase
      .from("customers")
      .select("id, name, email, company")
      .eq("org_id", org.id)
      .order("name", { ascending: true }),
    getInvoiceCapacity(supabase, org),
  ]);
  if (overview.error) throw new Error(`Could not load invoices: ${overview.error.message}`);
  if (cadences.error) throw new Error(`Could not load cadences: ${cadences.error.message}`);
  if (customers.error) throw new Error(`Could not load customers: ${customers.error.message}`);

  const pauseReasons = new Map((cadences.data ?? []).map((c) => [c.invoice_id, c.pause_reason]));

  const items: InvoiceListItem[] = [];
  for (const row of overview.data ?? []) {
    if (!row.id || !row.number || !row.due_at || !row.status || row.amount_cents === null) continue;
    const display = displayStatus(row.status, row.due_at, today);
    items.push({
      id: row.id,
      number: row.number,
      customerId: row.customer_id ?? "",
      customerName: row.customer_name ?? "Unknown customer",
      amountCents: row.amount_cents,
      currency: row.currency ?? "USD",
      dueAt: row.due_at,
      status: row.status,
      display,
      overdueDays: display === "overdue" ? daysOverdue(row.due_at, today) : 0,
      cadence:
        row.cadence_status && row.cadence_step !== null
          ? {
              status: row.cadence_status,
              step: row.cadence_step,
              next_run_at: row.next_run_at,
              paused_until: row.paused_until,
              pause_reason: pauseReasons.get(row.id) ?? null,
            }
          : null,
      sentTouchCount: row.sent_touch_count ?? 0,
    });
  }

  return {
    items,
    now,
    today,
    capacity,
    hasDemoData: (demo.count ?? 0) > 0,
    customers: customers.data ?? [],
  };
}

export const STATUS_FILTERS = ["all", "overdue", "open", "pending", "paid", "disputed"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  overdue: "Overdue",
  open: "Open",
  pending: "Pending",
  paid: "Paid",
  disputed: "Disputed",
};

export function matchesFilter(item: InvoiceListItem, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "overdue":
      return item.display === "overdue";
    case "open":
      // Open and not yet due; overdue invoices have their own tab.
      return item.display === "open";
    case "pending":
      return item.status === "pending_verification";
    case "paid":
      return item.status === "paid";
    case "disputed":
      return item.status === "disputed";
  }
}

export type SortKey = "due" | "amount";
export type SortDir = "asc" | "desc";

export function sortItems(items: InvoiceListItem[], key: SortKey, dir: SortDir): InvoiceListItem[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const primary =
      key === "amount" ? a.amountCents - b.amountCents : a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0;
    if (primary !== 0) return primary * sign;
    return a.number.localeCompare(b.number, "en", { numeric: true });
  });
}

export type TimelineTouch = Pick<
  Touch,
  | "id"
  | "step"
  | "tone"
  | "subject"
  | "body"
  | "status"
  | "confidence"
  | "rationale"
  | "sent_at"
  | "created_at"
  | "approved_at"
  | "reject_reason"
  | "snoozed_until"
>;

export type TimelineReply = Pick<
  Reply,
  "id" | "from_email" | "raw_text" | "received_at" | "classification" | "intent" | "handled" | "simulated"
>;

export type TimelineEvent = Pick<
  AgentEvent,
  "id" | "actor" | "type" | "entity_type" | "model" | "prompt_version" | "created_at" | "latency_ms"
>;

export type InvoiceDetailData = {
  invoice: Invoice;
  customer: Customer;
  cadence: Cadence | null;
  touches: TimelineTouch[];
  replies: TimelineReply[];
  events: TimelineEvent[];
  now: Date;
};

/**
 * One invoice with its customer, cadence and full history, scoped to the org.
 * Null when not found. Memoised per request (metadata and page share it).
 */
export const loadInvoiceDetail = cache(async function loadInvoiceDetail(
  org: Organization,
  invoiceId: string,
): Promise<InvoiceDetailData | null> {
  const supabase = await createClient();
  const now = new Date();

  const invoiceResult = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (invoiceResult.error) throw new Error(`Could not load the invoice: ${invoiceResult.error.message}`);
  const invoice = invoiceResult.data;
  if (!invoice) return null;

  const [customer, cadence, touches, replies] = await Promise.all([
    supabase.from("customers").select("*").eq("id", invoice.customer_id).eq("org_id", org.id).single(),
    supabase.from("cadences").select("*").eq("invoice_id", invoice.id).eq("org_id", org.id).maybeSingle(),
    supabase
      .from("touches")
      .select(
        "id, step, tone, subject, body, status, confidence, rationale, sent_at, created_at, approved_at, reject_reason, snoozed_until",
      )
      .eq("invoice_id", invoice.id)
      .eq("org_id", org.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("replies")
      .select("id, from_email, raw_text, received_at, classification, intent, handled, simulated")
      .eq("invoice_id", invoice.id)
      .eq("org_id", org.id)
      .order("received_at", { ascending: false }),
  ]);
  if (customer.error) throw new Error(`Could not load the customer: ${customer.error.message}`);
  if (cadence.error) throw new Error(`Could not load the cadence: ${cadence.error.message}`);
  if (touches.error) throw new Error(`Could not load reminders: ${touches.error.message}`);
  if (replies.error) throw new Error(`Could not load replies: ${replies.error.message}`);

  // Events about the invoice itself and about its cadence, touches and replies.
  const entityIds = [
    invoice.id,
    ...(cadence.data ? [cadence.data.id] : []),
    ...touches.data.map((t) => t.id),
    ...replies.data.map((r) => r.id),
  ];
  const events = await supabase
    .from("agent_events")
    .select("id, actor, type, entity_type, model, prompt_version, created_at, latency_ms")
    .eq("org_id", org.id)
    .in("entity_id", entityIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (events.error) throw new Error(`Could not load activity: ${events.error.message}`);

  return {
    invoice,
    customer: customer.data,
    cadence: cadence.data,
    touches: touches.data,
    replies: replies.data,
    events: events.data,
    now,
  };
});
