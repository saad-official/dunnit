import "server-only";
import type { InvoiceStatus, Organization as OrganizationRow } from "@/lib/db/types";
import type { Client } from "@/lib/services/shared";

/** Free plan: up to 10 active invoices (spec section 2). */
export const FREE_ACTIVE_INVOICE_LIMIT = 10;

/** Statuses that count against the Free plan limit (everything not closed). */
export const ACTIVE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "open",
  "pending_verification",
  "disputed",
  "paused",
];

export type InvoiceCapacity = {
  plan: OrganizationRow["plan"];
  active: number;
  /** null on Pro (unlimited). */
  limit: number | null;
  /** How many more active invoices may be added; null on Pro. */
  remaining: number | null;
  atLimit: boolean;
};

export async function countActiveInvoices(client: Client, orgId: string): Promise<number> {
  const { count, error } = await client
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("status", [...ACTIVE_INVOICE_STATUSES]);
  if (error) throw new Error(`count active invoices: ${error.message}`);
  return count ?? 0;
}

/** Server-side plan gate. Read `organizations.plan` from the caller's org row. */
export async function getInvoiceCapacity(client: Client, org: OrganizationRow): Promise<InvoiceCapacity> {
  const active = await countActiveInvoices(client, org.id);
  if (org.plan !== "free") {
    return { plan: org.plan, active, limit: null, remaining: null, atLimit: false };
  }
  const remaining = Math.max(0, FREE_ACTIVE_INVOICE_LIMIT - active);
  return {
    plan: org.plan,
    active,
    limit: FREE_ACTIVE_INVOICE_LIMIT,
    remaining,
    atLimit: remaining === 0,
  };
}
