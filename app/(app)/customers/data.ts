import "server-only";
import { cache } from "react";
import type { CadenceStateInput } from "@/components/invoices/cadence";
import { displayStatus, todayInZone, type DisplayStatus } from "@/components/invoices/format";
import type { Customer, InvoiceStatus, Organization } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

/** Invoice statuses that still count as owed. */
const OUTSTANDING: ReadonlySet<InvoiceStatus> = new Set(["open", "pending_verification", "disputed", "paused"]);

export type Balance = { currency: string; cents: number };

export type CustomerListItem = Pick<
  Customer,
  "id" | "name" | "company" | "email" | "risk_score" | "do_not_contact" | "contact_flag"
> & {
  /** Outstanding amount per currency, largest first; empty when nothing is owed. */
  openBalance: Balance[];
  invoiceCount: number;
  outstandingCount: number;
};

function addBalance(map: Map<string, number>, currency: string, cents: number) {
  map.set(currency, (map.get(currency) ?? 0) + cents);
}

function toBalances(map: Map<string, number>): Balance[] {
  return [...map.entries()].map(([currency, cents]) => ({ currency, cents })).sort((a, b) => b.cents - a.cents);
}

export async function loadCustomerList(org: Organization): Promise<CustomerListItem[]> {
  const supabase = await createClient();
  const [customers, invoices] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, company, email, risk_score, do_not_contact, contact_flag")
      .eq("org_id", org.id)
      .order("name", { ascending: true }),
    supabase.from("invoices").select("customer_id, amount_cents, currency, status").eq("org_id", org.id),
  ]);
  if (customers.error) throw new Error(`Could not load customers: ${customers.error.message}`);
  if (invoices.error) throw new Error(`Could not load invoices: ${invoices.error.message}`);

  const stats = new Map<string, { balance: Map<string, number>; count: number; outstanding: number }>();
  for (const invoice of invoices.data) {
    const entry = stats.get(invoice.customer_id) ?? { balance: new Map(), count: 0, outstanding: 0 };
    entry.count++;
    if (OUTSTANDING.has(invoice.status)) {
      entry.outstanding++;
      addBalance(entry.balance, invoice.currency, invoice.amount_cents);
    }
    stats.set(invoice.customer_id, entry);
  }

  return customers.data.map((customer) => {
    const entry = stats.get(customer.id);
    return {
      ...customer,
      openBalance: entry ? toBalances(entry.balance) : [],
      invoiceCount: entry?.count ?? 0,
      outstandingCount: entry?.outstanding ?? 0,
    };
  });
}

export type CustomerInvoiceItem = {
  id: string;
  number: string;
  amountCents: number;
  currency: string;
  dueAt: string;
  display: DisplayStatus;
  cadence: CadenceStateInput | null;
};

export type CustomerDetailData = {
  customer: Customer;
  invoices: CustomerInvoiceItem[];
  openBalance: Balance[];
  now: Date;
};

/** One customer and their invoices, scoped to the org. Null when not found. Memoised per request. */
export const loadCustomerDetail = cache(async function loadCustomerDetail(
  org: Organization,
  customerId: string,
): Promise<CustomerDetailData | null> {
  const supabase = await createClient();
  const now = new Date();
  const today = todayInZone(now, org.timezone || "UTC");

  const customer = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (customer.error) throw new Error(`Could not load the customer: ${customer.error.message}`);
  if (!customer.data) return null;

  const overview = await supabase
    .from("invoice_overview")
    .select("*")
    .eq("org_id", org.id)
    .eq("customer_id", customerId)
    .order("due_at", { ascending: false });
  if (overview.error) throw new Error(`Could not load invoices: ${overview.error.message}`);

  // invoice_overview has no pause_reason; fetch it for this customer's cadences.
  const invoiceIds = overview.data.flatMap((row) => (row.id ? [row.id] : []));
  const cadences =
    invoiceIds.length > 0
      ? await supabase
          .from("cadences")
          .select("invoice_id, pause_reason")
          .eq("org_id", org.id)
          .in("invoice_id", invoiceIds)
      : { data: [], error: null };
  if (cadences.error) throw new Error(`Could not load cadences: ${cadences.error.message}`);
  const pauseReasons = new Map(cadences.data.map((c) => [c.invoice_id, c.pause_reason]));

  const balance = new Map<string, number>();
  const invoices: CustomerInvoiceItem[] = [];
  for (const row of overview.data) {
    if (!row.id || !row.number || !row.due_at || !row.status || row.amount_cents === null) continue;
    const currency = row.currency ?? "USD";
    if (OUTSTANDING.has(row.status)) addBalance(balance, currency, row.amount_cents);
    invoices.push({
      id: row.id,
      number: row.number,
      amountCents: row.amount_cents,
      currency,
      dueAt: row.due_at,
      display: displayStatus(row.status, row.due_at, today),
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
    });
  }

  return { customer: customer.data, invoices, openBalance: toBalances(balance), now };
});
