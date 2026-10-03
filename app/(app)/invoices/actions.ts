"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult, CsvImportActionResult } from "@/components/invoices/action-result";
import { requireOrgContext } from "@/lib/db/queries";
import type { Customer as CustomerRow } from "@/lib/db/types";
import { clearDemoData, seedDemoData } from "@/lib/demo/seed";
import { parseInvoiceCsv } from "@/lib/domain/csv";
import { parseAmountToCents } from "@/lib/domain/money";
import {
  createInvoice,
  importInvoicesCsv,
  markInvoicePaid,
  setInvoiceStatus,
  upsertCustomer,
} from "@/lib/services/invoices";
import { FREE_ACTIVE_INVOICE_LIMIT, getInvoiceCapacity } from "@/lib/services/plan-limits";
import type { Client } from "@/lib/services/shared";
import { createClient } from "@/lib/supabase/server";

/*
 * Invoice Server Actions. Each one: requireOrgContext() first, then every read
 * and write is scoped to ctx.org.id through the per-request client (RLS
 * enforces the same boundary). Services that take only an invoice id are
 * called after an org-scoped ownership check.
 */

const FREE_LIMIT_ERROR = `The Free plan covers ${FREE_ACTIVE_INVOICE_LIMIT} active invoices. Upgrade to Pro on the Billing page to add more.`;

const MAX_CSV_BYTES = 512 * 1024;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function firstErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

function failure(error: unknown, fallback: string): ActionResult {
  console.error(fallback, error);
  return { ok: false, error: fallback };
}

function revalidateInvoiceScreens(invoiceId?: string, customerId?: string) {
  revalidatePath("/invoices");
  revalidatePath("/customers");
  revalidatePath("/dashboard");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

async function loadOwnedInvoice(client: Client, orgId: string, invoiceId: string) {
  const { data, error } = await client
    .from("invoices")
    .select("id, org_id, customer_id, number, status")
    .eq("id", invoiceId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`load invoice: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Add invoice
// ---------------------------------------------------------------------------

const NewInvoiceSchema = z
  .object({
    customerId: z.union([z.literal("new"), z.uuid({ error: "Choose a customer." })]),
    customerName: z.string().trim().max(200, { error: "Keep the name under 200 characters." }),
    customerEmail: z.string().trim().max(320),
    customerCompany: z.string().trim().max(200, { error: "Keep the company under 200 characters." }),
    number: z
      .string()
      .trim()
      .min(1, { error: "Enter the invoice number." })
      .max(64, { error: "Keep the number under 64 characters." }),
    amount: z.string().trim().min(1, { error: "Enter the amount." }),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, { error: "Use a 3-letter currency code, e.g. USD." }),
    issuedAt: z.iso.date({ error: "Enter the issue date." }),
    dueAt: z.iso.date({ error: "Enter the due date." }),
  })
  .superRefine((value, ctx) => {
    if (value.customerId === "new") {
      if (!value.customerName) {
        ctx.addIssue({ code: "custom", path: ["customerName"], message: "Enter the customer's name." });
      }
      if (!z.email().safeParse(value.customerEmail).success) {
        ctx.addIssue({ code: "custom", path: ["customerEmail"], message: "Enter a valid billing email." });
      }
    }
    const cents = parseAmountToCents(value.amount);
    if (cents === null) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount like 1,250.00." });
    } else if (cents <= 0) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "The amount must be more than zero." });
    }
    if (value.issuedAt && value.dueAt && value.dueAt < value.issuedAt) {
      ctx.addIssue({ code: "custom", path: ["dueAt"], message: "The due date can't be before the issue date." });
    }
  });

export async function createInvoiceAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrgContext();

  const parsed = NewInvoiceSchema.safeParse({
    customerId: text(formData, "customerId") || "new",
    customerName: text(formData, "customerName"),
    customerEmail: text(formData, "customerEmail"),
    customerCompany: text(formData, "customerCompany"),
    number: text(formData, "number"),
    amount: text(formData, "amount"),
    currency: text(formData, "currency") || "USD",
    issuedAt: text(formData, "issuedAt"),
    dueAt: text(formData, "dueAt"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };
  const input = parsed.data;
  const amountCents = parseAmountToCents(input.amount) as number;

  const supabase = await createClient();
  try {
    const capacity = await getInvoiceCapacity(supabase, ctx.org);
    if (capacity.atLimit) return { ok: false, error: FREE_LIMIT_ERROR };

    const duplicate = await supabase
      .from("invoices")
      .select("id")
      .eq("org_id", ctx.org.id)
      .eq("number", input.number)
      .maybeSingle();
    if (duplicate.error) throw new Error(duplicate.error.message);
    if (duplicate.data) {
      return { ok: false, fieldErrors: { number: `Invoice ${input.number} already exists.` } };
    }

    let customer: CustomerRow;
    if (input.customerId === "new") {
      customer = await upsertCustomer(supabase, ctx.org.id, {
        name: input.customerName,
        email: input.customerEmail,
        company: input.customerCompany || null,
      });
    } else {
      const found = await supabase
        .from("customers")
        .select("*")
        .eq("id", input.customerId)
        .eq("org_id", ctx.org.id)
        .maybeSingle();
      if (found.error) throw new Error(found.error.message);
      if (!found.data) return { ok: false, fieldErrors: { customerId: "That customer no longer exists." } };
      customer = found.data;
    }

    const invoice = await createInvoice(supabase, ctx.org, customer, {
      customerId: customer.id,
      number: input.number,
      amountCents,
      currency: input.currency,
      issuedAt: input.issuedAt,
      dueAt: input.dueAt,
      source: "manual",
    });
    revalidateInvoiceScreens(invoice.id, customer.id);
    return { ok: true, message: `Invoice ${invoice.number} added and its cadence planned.` };
  } catch (error) {
    return failure(error, "Could not add the invoice. Try again.");
  }
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

const CsvSchema = z
  .string()
  .min(1, { error: "Choose a file or paste CSV text." })
  .refine((v) => new TextEncoder().encode(v).byteLength <= MAX_CSV_BYTES, {
    error: "That file is larger than 512 KB. Split it and import in parts.",
  });

export async function importInvoicesCsvAction(csvText: string): Promise<CsvImportActionResult> {
  const ctx = await requireOrgContext();

  const parsed = CsvSchema.safeParse(csvText);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  try {
    const capacity = await getInvoiceCapacity(supabase, ctx.org);
    if (capacity.remaining !== null) {
      if (capacity.remaining === 0) return { ok: false, error: FREE_LIMIT_ERROR };
      // Count only the rows the import would actually create.
      const preview = parseInvoiceCsv(parsed.data);
      const existing = await supabase.from("invoices").select("number").eq("org_id", ctx.org.id);
      if (existing.error) throw new Error(existing.error.message);
      const taken = new Set((existing.data ?? []).map((r) => r.number.toLowerCase()));
      const incoming = preview.rows.filter((r) => !taken.has(r.number.toLowerCase())).length;
      if (incoming > capacity.remaining) {
        return {
          ok: false,
          error: `This file has ${incoming} new invoices, but your Free plan has room for ${capacity.remaining} more (limit ${FREE_ACTIVE_INVOICE_LIMIT} active). Trim the file or upgrade to Pro on the Billing page.`,
        };
      }
    }

    const result = await importInvoicesCsv(supabase, ctx.org, parsed.data);
    revalidateInvoiceScreens();
    return {
      ok: result.created > 0,
      created: result.created,
      errors: result.errors,
      message:
        result.created > 0
          ? `Imported ${result.created} ${result.created === 1 ? "invoice" : "invoices"}.`
          : undefined,
      error: result.created === 0 ? "No invoices were imported. Check the errors below." : undefined,
    };
  } catch (error) {
    return failure(error, "The import failed. Nothing further was imported; try again.");
  }
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

export async function seedDemoDataAction(): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  try {
    const result = await seedDemoData(supabase, ctx.org);
    if (result.skipped) return { ok: false, error: "Demo data is already loaded." };
    revalidateInvoiceScreens();
    revalidatePath("/queue");
    revalidatePath("/inbox");
    return {
      ok: true,
      message: `Loaded ${result.invoices} demo invoices for ${result.customers} customers.`,
    };
  } catch (error) {
    return failure(error, "Could not load demo data. Try again.");
  }
}

export async function clearDemoDataAction(): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  // RLS only lets owners delete invoices and customers; say so instead of silently deleting nothing.
  if (ctx.role !== "owner") {
    return { ok: false, error: "Only the organization owner can remove demo data." };
  }
  const supabase = await createClient();
  try {
    const removed = await clearDemoData(supabase, ctx.org.id);
    revalidateInvoiceScreens();
    revalidatePath("/queue");
    revalidatePath("/inbox");
    revalidatePath("/outbox");
    return {
      ok: true,
      message: removed > 0 ? `Removed ${removed} demo invoices.` : "There was no demo data to remove.",
    };
  } catch (error) {
    return failure(error, "Could not remove demo data. Try again.");
  }
}

// ---------------------------------------------------------------------------
// Status changes from the invoice detail page
// ---------------------------------------------------------------------------

const InvoiceIdSchema = z.uuid({ error: "Unknown invoice." });

/** Which manual status changes each status allows (spec 4 status machine). */
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  open: ["paused", "written_off"],
  paused: ["open", "written_off"],
  disputed: ["open", "written_off"],
  pending_verification: ["open", "written_off"],
  paid: [],
  written_off: [],
};

const PAYABLE = new Set(["open", "paused", "disputed", "pending_verification"]);

export async function markInvoicePaidAction(invoiceId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  const id = InvoiceIdSchema.safeParse(invoiceId);
  if (!id.success) return { ok: false, error: "Unknown invoice." };

  const supabase = await createClient();
  try {
    const invoice = await loadOwnedInvoice(supabase, ctx.org.id, id.data);
    if (!invoice) return { ok: false, error: "Invoice not found." };
    if (!PAYABLE.has(invoice.status)) {
      return { ok: false, error: `Invoice ${invoice.number} is already closed.` };
    }
    await markInvoicePaid(supabase, invoice.id);
    revalidateInvoiceScreens(invoice.id, invoice.customer_id);
    return { ok: true, message: `Invoice ${invoice.number} marked paid. Chasing stopped.` };
  } catch (error) {
    return failure(error, "Could not mark the invoice paid. Try again.");
  }
}

const StatusChangeSchema = z.object({
  invoiceId: InvoiceIdSchema,
  status: z.enum(["open", "paused", "written_off"]),
});

const STATUS_MESSAGES: Record<z.infer<typeof StatusChangeSchema>["status"], string> = {
  open: "reopened; its cadence is re-planned",
  paused: "paused; Dunnit won't chase it until you resume",
  written_off: "written off; chasing stopped",
};

export async function setInvoiceStatusAction(
  invoiceId: string,
  status: "open" | "paused" | "written_off",
): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  const parsed = StatusChangeSchema.safeParse({ invoiceId, status });
  if (!parsed.success) return { ok: false, error: "That status change isn't allowed." };

  const supabase = await createClient();
  try {
    const invoice = await loadOwnedInvoice(supabase, ctx.org.id, parsed.data.invoiceId);
    if (!invoice) return { ok: false, error: "Invoice not found." };
    if (!ALLOWED_TRANSITIONS[invoice.status]?.includes(parsed.data.status)) {
      return { ok: false, error: `Invoice ${invoice.number} can't move from ${invoice.status.replaceAll("_", " ")} to ${parsed.data.status.replaceAll("_", " ")}.` };
    }
    await setInvoiceStatus(supabase, invoice.id, parsed.data.status);
    revalidateInvoiceScreens(invoice.id, invoice.customer_id);
    return { ok: true, message: `Invoice ${invoice.number} ${STATUS_MESSAGES[parsed.data.status]}.` };
  } catch (error) {
    return failure(error, "Could not update the invoice. Try again.");
  }
}
