"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/invoices/action-result";
import { requireOrgContext } from "@/lib/db/queries";
import { createCustomer, DuplicateCustomerEmailError, updateCustomer } from "@/lib/services/customers";
import { NotFoundError } from "@/lib/services/shared";
import { createClient } from "@/lib/supabase/server";

/*
 * Customer Server Actions. requireOrgContext() first; every query in the
 * services they call is filtered by ctx.org.id on the per-request client, and
 * RLS enforces the same boundary.
 */

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

const Name = z
  .string()
  .trim()
  .min(1, { error: "Enter a name." })
  .max(200, { error: "Keep the name under 200 characters." });
const Email = z.email({ error: "Enter a valid email address." }).max(320, { error: "That email is too long." });
const Company = z.string().trim().max(200, { error: "Keep the company under 200 characters." });
const RiskScore = z.coerce
  .number({ error: "Risk score must be a number." })
  .int({ error: "Use a whole number." })
  .min(0, { error: "Risk score is 0 to 100." })
  .max(100, { error: "Risk score is 0 to 100." });

const NewCustomerSchema = z.object({
  name: Name,
  email: Email,
  company: Company,
  riskScore: RiskScore,
});

export async function createCustomerAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrgContext();

  const parsed = NewCustomerSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email").trim(),
    company: text(formData, "company"),
    riskScore: text(formData, "riskScore") || "30",
  });
  if (!parsed.success) return { ok: false, fieldErrors: firstErrors(parsed.error) };

  const supabase = await createClient();
  try {
    const customer = await createCustomer(supabase, ctx.org.id, {
      name: parsed.data.name,
      email: parsed.data.email,
      company: parsed.data.company || null,
      riskScore: parsed.data.riskScore,
    });
    revalidatePath("/customers");
    revalidatePath("/invoices");
    return { ok: true, message: `${customer.name} added.` };
  } catch (error) {
    if (error instanceof DuplicateCustomerEmailError) {
      return { ok: false, fieldErrors: { email: "A customer with this email already exists." } };
    }
    console.error("createCustomerAction", error);
    return { ok: false, error: "Could not add the customer. Try again." };
  }
}

const UpdateCustomerSchema = z.object({
  customerId: z.uuid({ error: "Unknown customer." }),
  name: Name,
  email: Email,
  company: Company,
  notes: z.string().trim().max(2000, { error: "Keep notes under 2,000 characters." }),
  riskScore: RiskScore,
  doNotContact: z.boolean(),
  contactFlag: z.enum(["none", "wrong_contact", "bounced", "unsubscribed"], {
    error: "Choose a contact status.",
  }),
});

export async function updateCustomerAction(customerId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrgContext();

  const parsed = UpdateCustomerSchema.safeParse({
    customerId,
    name: text(formData, "name"),
    email: text(formData, "email").trim(),
    company: text(formData, "company"),
    notes: text(formData, "notes"),
    riskScore: text(formData, "riskScore"),
    doNotContact: text(formData, "doNotContact") === "on",
    contactFlag: text(formData, "contactFlag") || "none",
  });
  if (!parsed.success) {
    const fieldErrors = firstErrors(parsed.error);
    if (fieldErrors.customerId) return { ok: false, error: fieldErrors.customerId };
    return { ok: false, fieldErrors };
  }
  const input = parsed.data;

  const supabase = await createClient();
  try {
    const result = await updateCustomer(supabase, ctx.org, input.customerId, {
      name: input.name,
      email: input.email,
      company: input.company || null,
      notes: input.notes || null,
      riskScore: input.riskScore,
      doNotContact: input.doNotContact,
      contactFlag: input.contactFlag,
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${result.customer.id}`);
    revalidatePath("/invoices", "layout");
    revalidatePath("/dashboard");

    const notes: string[] = ["Customer saved."];
    if (result.flagReset) notes.push("New email clears the wrong-contact flag.");
    if (result.replanned > 0) {
      notes.push(`Re-planned ${result.replanned} open ${result.replanned === 1 ? "invoice" : "invoices"}.`);
    }
    return { ok: true, message: notes.join(" ") };
  } catch (error) {
    if (error instanceof DuplicateCustomerEmailError) {
      return { ok: false, fieldErrors: { email: "Another customer already uses this email." } };
    }
    if (error instanceof NotFoundError) {
      return { ok: false, error: "This customer no longer exists." };
    }
    console.error("updateCustomerAction", error);
    return { ok: false, error: "Could not save the customer. Try again." };
  }
}
