import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type {
  Cadence as CadenceRow,
  Customer as CustomerRow,
  Invoice as InvoiceRow,
  Organization as OrganizationRow,
} from "@/lib/db/types";

export type Client = SupabaseClient<Database>;

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`);
    this.name = "NotFoundError";
  }
}

export function unwrap<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  what: string,
): NonNullable<R["data"]> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) throw new Error(`${what}: no data`);
  return result.data as NonNullable<R["data"]>;
}

export type InvoiceBundle = {
  org: OrganizationRow;
  invoice: InvoiceRow;
  customer: CustomerRow;
  cadence: CadenceRow | null;
};

/** Loads an invoice with its organization, customer and cadence in one go. */
export async function loadInvoiceBundle(client: Client, invoiceId: string): Promise<InvoiceBundle> {
  const invoice = unwrap(
    await client.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
    "load invoice",
  );
  const [org, customer, cadence] = await Promise.all([
    client.from("organizations").select("*").eq("id", invoice.org_id).maybeSingle(),
    client.from("customers").select("*").eq("id", invoice.customer_id).maybeSingle(),
    client.from("cadences").select("*").eq("invoice_id", invoice.id).maybeSingle(),
  ]);
  return {
    org: unwrap(org, "load organization"),
    invoice,
    customer: unwrap(customer, "load customer"),
    cadence: cadence.data ?? null,
  };
}

export function formatIsoDate(iso: string, locale = "en-US"): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
