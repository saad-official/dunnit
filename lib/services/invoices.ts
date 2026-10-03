import "server-only";
import { logAgentEvent } from "@/lib/ai/log";
import type { Customer as CustomerRow, Invoice as InvoiceRow, Organization as OrganizationRow } from "@/lib/db/types";
import { parseInvoiceCsv, type CsvError } from "@/lib/domain/csv";
import { ensureCadence, stopCadence } from "@/lib/services/cadences";
import { unwrap, type Client } from "@/lib/services/shared";

export type NewCustomer = { name: string; email: string; company?: string | null; riskScore?: number };

/** Finds a customer by email within the org (case-insensitive) or creates one. */
export async function upsertCustomer(client: Client, orgId: string, input: NewCustomer): Promise<CustomerRow> {
  const email = input.email.trim().toLowerCase();
  const existing = await client
    .from("customers")
    .select("*")
    .eq("org_id", orgId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(`find customer: ${existing.error.message}`);
  if (existing.data) return existing.data;

  return unwrap(
    await client
      .from("customers")
      .insert({
        org_id: orgId,
        name: input.name.trim(),
        email,
        company: input.company?.trim() || null,
        risk_score: input.riskScore ?? 30,
      })
      .select()
      .single(),
    "create customer",
  );
}

export type NewInvoice = {
  customerId: string;
  number: string;
  amountCents: number;
  currency?: string;
  issuedAt: string;
  dueAt: string;
  source?: "manual" | "csv" | "demo" | "stripe";
  externalId?: string | null;
  status?: InvoiceRow["status"];
  paidAt?: string | null;
};

/** Creates an invoice and its cadence. */
export async function createInvoice(
  client: Client,
  org: OrganizationRow,
  customer: CustomerRow,
  input: NewInvoice,
  now = new Date(),
  actor: "user" | "system" = "user",
): Promise<InvoiceRow> {
  const invoice = unwrap(
    await client
      .from("invoices")
      .insert({
        org_id: org.id,
        customer_id: customer.id,
        number: input.number.trim(),
        amount_cents: input.amountCents,
        currency: (input.currency ?? "USD").toUpperCase(),
        issued_at: input.issuedAt,
        due_at: input.dueAt,
        source: input.source ?? "manual",
        external_id: input.externalId ?? null,
        status: input.status ?? "open",
        paid_at: input.paidAt ?? null,
      })
      .select()
      .single(),
    "create invoice",
  );
  await ensureCadence(client, org, invoice, customer, now);
  await logAgentEvent(client, {
    orgId: org.id,
    actor,
    type: "invoice.created",
    entityType: "invoice",
    entityId: invoice.id,
    input: { source: invoice.source, amountCents: invoice.amount_cents, dueAt: invoice.due_at },
  });
  return invoice;
}

export type CsvImportResult = { created: number; errors: CsvError[] };

/** Parses a CSV and creates customers, invoices and cadences for valid rows. */
export async function importInvoicesCsv(
  client: Client,
  org: OrganizationRow,
  csvText: string,
  now = new Date(),
): Promise<CsvImportResult> {
  const parsed = parseInvoiceCsv(csvText);
  const errors = [...parsed.errors];
  let created = 0;

  const existing = await client.from("invoices").select("number").eq("org_id", org.id);
  const taken = new Set((existing.data ?? []).map((r) => r.number.toLowerCase()));

  for (const row of parsed.rows) {
    if (taken.has(row.number.toLowerCase())) {
      errors.push({ line: row.line, message: `Invoice ${row.number} already exists` });
      continue;
    }
    try {
      const customer = await upsertCustomer(client, org.id, { name: row.customerName, email: row.email });
      await createInvoice(
        client,
        org,
        customer,
        {
          customerId: customer.id,
          number: row.number,
          amountCents: row.amountCents,
          currency: row.currency,
          issuedAt: row.issuedAt,
          dueAt: row.dueAt,
          source: "csv",
        },
        now,
      );
      taken.add(row.number.toLowerCase());
      created++;
    } catch (error) {
      errors.push({ line: row.line, message: error instanceof Error ? error.message : String(error) });
    }
  }

  await logAgentEvent(client, {
    orgId: org.id,
    actor: "user",
    type: "invoices.imported",
    output: { created, errors: errors.length },
  });
  return { created, errors };
}

/** Owner confirms payment: closes the invoice and stops its cadence. */
export async function markInvoicePaid(client: Client, invoiceId: string, paidAt = new Date()): Promise<InvoiceRow> {
  const invoice = unwrap(
    await client
      .from("invoices")
      .update({ status: "paid", paid_at: paidAt.toISOString() })
      .eq("id", invoiceId)
      .select()
      .single(),
    "mark invoice paid",
  );
  await stopCadence(client, invoice.id, "paid");
  await logAgentEvent(client, {
    orgId: invoice.org_id,
    actor: "user",
    type: "invoice.paid",
    entityType: "invoice",
    entityId: invoice.id,
    output: { paidAt: invoice.paid_at },
  });
  return invoice;
}

/** Owner changes status manually (reopen a dispute, pause, write off). */
export async function setInvoiceStatus(
  client: Client,
  invoiceId: string,
  status: InvoiceRow["status"],
  now = new Date(),
): Promise<InvoiceRow> {
  if (status === "paid") return markInvoicePaid(client, invoiceId, now);
  const invoice = unwrap(
    await client.from("invoices").update({ status, paid_at: null }).eq("id", invoiceId).select().single(),
    "set invoice status",
  );
  if (status === "written_off") {
    await stopCadence(client, invoice.id, "written_off");
  } else {
    const [org, customer] = await Promise.all([
      client.from("organizations").select("*").eq("id", invoice.org_id).single(),
      client.from("customers").select("*").eq("id", invoice.customer_id).single(),
    ]);
    if (org.data && customer.data) {
      const cadence = await client.from("cadences").select("step").eq("invoice_id", invoice.id).maybeSingle();
      await ensureCadence(client, org.data, invoice, customer.data, now, cadence.data?.step ?? 0);
    }
  }
  await logAgentEvent(client, {
    orgId: invoice.org_id,
    actor: "user",
    type: "invoice.status_changed",
    entityType: "invoice",
    entityId: invoice.id,
    output: { status },
  });
  return invoice;
}
