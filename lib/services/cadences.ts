import "server-only";
import { planCadence, shouldStop, type PlannedStep } from "@/lib/domain/cadence";
import { toDomainCustomer, toDomainInvoice, toDomainOrganization } from "@/lib/db/mappers";
import type {
  Cadence as CadenceRow,
  Customer as CustomerRow,
  Invoice as InvoiceRow,
  Organization as OrganizationRow,
} from "@/lib/db/types";
import { unwrap, type Client } from "@/lib/services/shared";

/**
 * Creates or refreshes the cadence row for an invoice from the deterministic
 * plan. `step` is the last ladder step sent (0 = none). `next_run_at` is the
 * scheduled time of the next planned step, or null when nothing remains.
 */
export async function ensureCadence(
  client: Client,
  org: OrganizationRow,
  invoice: InvoiceRow,
  customer: CustomerRow,
  now: Date,
  lastStep = 0,
): Promise<CadenceRow> {
  const plan = planCadence(
    toDomainInvoice(invoice),
    toDomainCustomer(customer),
    { timezone: toDomainOrganization(org).timezone },
    now,
  );
  const stop = shouldStop(toDomainInvoice(invoice), toDomainCustomer(customer));
  const next = nextPlannedStep(plan, lastStep);

  const row = {
    invoice_id: invoice.id,
    org_id: invoice.org_id,
    step: lastStep,
    status: stop
      ? stop === "paid" || stop === "written_off" || stop === "do_not_contact"
        ? ("stopped" as const)
        : ("paused" as const)
      : next
        ? ("active" as const)
        : ("completed" as const),
    next_run_at: next ? next.scheduledAt.toISOString() : null,
    pause_reason: stop && stop !== "paid" && stop !== "written_off" && stop !== "do_not_contact" ? stop : null,
    paused_until: null,
  };

  return unwrap(
    await client.from("cadences").upsert(row, { onConflict: "invoice_id" }).select().single(),
    "upsert cadence",
  );
}

/** First planned step after the last one sent. */
export function nextPlannedStep(plan: PlannedStep[], lastStep: number): PlannedStep | undefined {
  return plan.find((s) => s.step > lastStep);
}

/** After a ladder step is sent: record it and schedule the following one. */
export async function advanceCadence(
  client: Client,
  org: OrganizationRow,
  invoice: InvoiceRow,
  customer: CustomerRow,
  cadence: CadenceRow,
  sentStep: number,
  now: Date,
): Promise<CadenceRow> {
  const lastStep = Math.max(cadence.step, sentStep);
  const plan = planCadence(
    toDomainInvoice(invoice),
    toDomainCustomer(customer),
    { timezone: org.timezone || "UTC" },
    now,
  );
  const next = nextPlannedStep(plan, lastStep);
  const patch = next
    ? { step: lastStep, status: "active" as const, next_run_at: next.scheduledAt.toISOString() }
    : { step: lastStep, status: "completed" as const, next_run_at: null };
  return unwrap(
    await client.from("cadences").update(patch).eq("id", cadence.id).select().single(),
    "advance cadence",
  );
}

/** Stops chasing for good (paid, written off, do-not-contact). */
export async function stopCadence(client: Client, invoiceId: string, reason: string): Promise<void> {
  const { error } = await client
    .from("cadences")
    .update({ status: "stopped", next_run_at: null, paused_until: null, pause_reason: reason })
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(`stop cadence: ${error.message}`);
}
