import "server-only";
import type { Cadence as CadenceRow, Invoice as InvoiceRow } from "@/lib/db/types";
import type { ReplyTask } from "@/lib/domain/replies";
import { ReplyClassificationSchema, type ReplyClassification } from "@/lib/domain/types";
import { formatCents } from "@/lib/domain/money";
import { deriveReplyTasks } from "@/lib/services/replies";
import type { Client } from "@/lib/services/shared";

export type InboxTab = "attention" | "all";

export type InboxTask = ReplyTask & { done: boolean };

/** Plain, serialisable reply for the Inbox UI. */
export type InboxReply = {
  id: string;
  fromEmail: string;
  rawText: string;
  receivedAt: string;
  handled: boolean;
  handledAt: string | null;
  simulated: boolean;
  classification: ReplyClassification | null;
  invoice: {
    id: string;
    number: string;
    amountFormatted: string;
    status: InvoiceRow["status"];
  };
  customer: { name: string; email: string; company: string | null };
  cadenceStatus: CadenceRow["status"] | null;
  tasks: InboxTask[];
};

export type DemoInvoiceOption = {
  invoiceId: string;
  number: string;
  amountFormatted: string;
  customerName: string;
  customerEmail: string;
  lastSentSubject: string;
};

const REPLY_SELECT = "*, invoices(*, customers(name, email, company))" as const;

/**
 * Replies for the Inbox, newest first. "attention" = not yet handled. Owner
 * tasks are re-derived from the stored classification (they are not persisted).
 */
export async function loadInboxReplies(
  client: Client,
  org: { id: string; timezone: string | null },
  tab: InboxTab,
  now = new Date(),
  limit = 50,
): Promise<InboxReply[]> {
  let query = client
    .from("replies")
    .select(REPLY_SELECT)
    .eq("org_id", org.id)
    .order("received_at", { ascending: false })
    .limit(limit);
  if (tab === "attention") query = query.eq("handled", false);

  const { data, error } = await query;
  if (error) throw new Error(`load replies: ${error.message}`);
  const rows = data ?? [];

  const invoiceIds = [...new Set(rows.map((r) => r.invoice_id))];
  const cadences = new Map<string, CadenceRow>();
  if (invoiceIds.length > 0) {
    const res = await client.from("cadences").select("*").eq("org_id", org.id).in("invoice_id", invoiceIds);
    if (res.error) throw new Error(`load cadences: ${res.error.message}`);
    for (const c of res.data) cadences.set(c.invoice_id, c);
  }

  const timezone = org.timezone || "UTC";
  const out: InboxReply[] = [];
  for (const row of rows) {
    const joined = row.invoices;
    if (!joined) continue;
    const invoice = joined;
    const customer = joined.customers;
    const cadence = cadences.get(invoice.id) ?? null;
    const parsed = ReplyClassificationSchema.safeParse(row.classification);

    const tasks = deriveReplyTasks(row, invoice, cadence, now, timezone).map((task) => ({
      ...task,
      done: row.handled || (task.type === "confirm_payment" && invoice.status === "paid"),
    }));

    out.push({
      id: row.id,
      fromEmail: row.from_email,
      rawText: row.raw_text,
      receivedAt: row.received_at,
      handled: row.handled,
      handledAt: row.handled_at,
      simulated: row.simulated,
      classification: parsed.success ? parsed.data : null,
      invoice: {
        id: invoice.id,
        number: invoice.number,
        amountFormatted: safeFormatCents(invoice.amount_cents, invoice.currency),
        status: invoice.status,
      },
      customer: {
        name: customer?.name ?? "Unknown customer",
        email: customer?.email ?? row.from_email,
        company: customer?.company ?? null,
      },
      cadenceStatus: cadence?.status ?? null,
      tasks,
    });
  }
  return out;
}

export async function countReplies(client: Client, orgId: string): Promise<{ unhandled: number; total: number }> {
  const [unhandled, total] = await Promise.all([
    client.from("replies").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("handled", false),
    client.from("replies").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);
  if (unhandled.error) throw new Error(`count replies: ${unhandled.error.message}`);
  if (total.error) throw new Error(`count replies: ${total.error.message}`);
  return { unhandled: unhandled.count ?? 0, total: total.count ?? 0 };
}

/** Invoices with at least one sent touch: the only ones a demo reply makes sense for. */
export async function loadDemoInvoices(client: Client, orgId: string, limit = 200): Promise<DemoInvoiceOption[]> {
  const { data, error } = await client
    .from("touches")
    .select("invoice_id, subject, sent_at, invoices(number, amount_cents, currency, customers(name, email))")
    .eq("org_id", orgId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`load sent touches: ${error.message}`);

  const seen = new Map<string, DemoInvoiceOption>();
  for (const row of data ?? []) {
    if (seen.has(row.invoice_id)) continue;
    const invoice = row.invoices;
    const customer = invoice?.customers;
    if (!invoice || !customer) continue;
    seen.set(row.invoice_id, {
      invoiceId: row.invoice_id,
      number: invoice.number,
      amountFormatted: safeFormatCents(invoice.amount_cents, invoice.currency),
      customerName: customer.name,
      customerEmail: customer.email,
      lastSentSubject: row.subject,
    });
  }
  return [...seen.values()];
}

function safeFormatCents(cents: number, currency: string): string {
  try {
    return formatCents(cents, currency);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}
