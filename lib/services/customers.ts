import "server-only";
import { logAgentEvent } from "@/lib/ai/log";
import type {
  Cadence as CadenceRow,
  ContactFlag,
  Customer as CustomerRow,
  Organization as OrganizationRow,
} from "@/lib/db/types";
import { PAUSE_REASONS } from "@/lib/domain/replies";
import { ensureCadence } from "@/lib/services/cadences";
import { NotFoundError, unwrap, type Client } from "@/lib/services/shared";

/** Thrown when another customer in the org already uses the email. */
export class DuplicateCustomerEmailError extends Error {
  constructor(public readonly existingId: string) {
    super("Another customer already uses this email address.");
    this.name = "DuplicateCustomerEmailError";
  }
}

async function findByEmail(client: Client, orgId: string, email: string): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("customers")
    .select("id")
    .eq("org_id", orgId)
    // Escape LIKE wildcards: "_" is common in addresses and would otherwise match any character.
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`find customer by email: ${error.message}`);
  return data;
}

export type CreateCustomerInput = {
  name: string;
  email: string;
  company?: string | null;
  riskScore?: number;
  notes?: string | null;
};

/** Creates a customer. Unlike upsertCustomer, refuses a duplicate email instead of returning the match. */
export async function createCustomer(
  client: Client,
  orgId: string,
  input: CreateCustomerInput,
): Promise<CustomerRow> {
  const email = input.email.trim().toLowerCase();
  const existing = await findByEmail(client, orgId, email);
  if (existing) throw new DuplicateCustomerEmailError(existing.id);

  const customer = unwrap(
    await client
      .from("customers")
      .insert({
        org_id: orgId,
        name: input.name.trim(),
        email,
        company: input.company?.trim() || null,
        notes: input.notes?.trim() || null,
        risk_score: input.riskScore ?? 30,
      })
      .select()
      .single(),
    "create customer",
  );
  await logAgentEvent(client, {
    orgId,
    actor: "user",
    type: "customer.created",
    entityType: "customer",
    entityId: customer.id,
  });
  return customer;
}

export type CustomerPatch = {
  name: string;
  email: string;
  company: string | null;
  notes: string | null;
  riskScore: number;
  doNotContact: boolean;
  contactFlag: ContactFlag;
};

export type UpdateCustomerResult = {
  customer: CustomerRow;
  /** contact_flag went from wrong_contact to none because the email changed. */
  flagReset: boolean;
  /** Number of open invoices whose cadence was re-planned. */
  replanned: number;
};

/**
 * Cadence pauses caused by the contact itself. Re-planning may clear these;
 * any other pause (promise to pay, a question awaiting an answer, a reply under
 * review) belongs to reply handling and is left alone.
 */
const CONTACT_PAUSE_REASONS: ReadonlySet<string> = new Set([
  PAUSE_REASONS.wrong_contact,
  "contact_flagged",
  "do_not_contact",
]);

function shouldReplan(cadence: CadenceRow | undefined): boolean {
  if (!cadence) return true;
  if (cadence.status !== "paused") return true;
  return CONTACT_PAUSE_REASONS.has(cadence.pause_reason ?? "");
}

/**
 * Owner edits a customer. When the email changes while the contact is flagged
 * wrong_contact, the flag resets to none. Whenever a field the planner reads
 * changes (email, risk score, do-not-contact, contact flag), the cadences of
 * the customer's open invoices are re-planned with ensureCadence, keeping the
 * last step sent.
 */
export async function updateCustomer(
  client: Client,
  org: OrganizationRow,
  customerId: string,
  patch: CustomerPatch,
  now = new Date(),
): Promise<UpdateCustomerResult> {
  const currentResult = await client
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (currentResult.error) throw new Error(`load customer: ${currentResult.error.message}`);
  const current = currentResult.data;
  if (!current) throw new NotFoundError("customer", customerId);

  const email = patch.email.trim().toLowerCase();
  const emailChanged = email !== current.email.trim().toLowerCase();
  if (emailChanged) {
    const clash = await findByEmail(client, org.id, email);
    if (clash && clash.id !== current.id) throw new DuplicateCustomerEmailError(clash.id);
  }

  // A new address fixes a wrong contact, unless the owner explicitly chose another flag.
  const flagReset = emailChanged && current.contact_flag === "wrong_contact" && patch.contactFlag === "wrong_contact";
  const contactFlag: ContactFlag = flagReset ? "none" : patch.contactFlag;

  const customer = unwrap(
    await client
      .from("customers")
      .update({
        name: patch.name.trim(),
        email,
        company: patch.company?.trim() || null,
        notes: patch.notes?.trim() || null,
        risk_score: patch.riskScore,
        do_not_contact: patch.doNotContact,
        contact_flag: contactFlag,
      })
      .eq("id", current.id)
      .eq("org_id", org.id)
      .select()
      .single(),
    "update customer",
  );

  const plannerInputsChanged =
    emailChanged ||
    current.risk_score !== customer.risk_score ||
    current.do_not_contact !== customer.do_not_contact ||
    current.contact_flag !== customer.contact_flag;

  let replanned = 0;
  if (plannerInputsChanged) {
    const invoices = unwrap(
      await client
        .from("invoices")
        .select("*")
        .eq("org_id", org.id)
        .eq("customer_id", customer.id)
        .eq("status", "open"),
      "load open invoices",
    );
    if (invoices.length > 0) {
      const cadences = unwrap(
        await client
          .from("cadences")
          .select("*")
          .eq("org_id", org.id)
          .in(
            "invoice_id",
            invoices.map((i) => i.id),
          ),
        "load cadences",
      );
      const byInvoice = new Map(cadences.map((c) => [c.invoice_id, c]));
      for (const invoice of invoices) {
        const cadence = byInvoice.get(invoice.id);
        if (!shouldReplan(cadence)) continue;
        await ensureCadence(client, org, invoice, customer, now, cadence?.step ?? 0);
        replanned++;
      }
    }
  }

  await logAgentEvent(client, {
    orgId: org.id,
    actor: "user",
    type: flagReset ? "customer.contact_fixed" : "customer.updated",
    entityType: "customer",
    entityId: customer.id,
    output: {
      emailChanged,
      flagReset,
      replanned,
      doNotContact: customer.do_not_contact,
      contactFlag: customer.contact_flag,
      riskScore: customer.risk_score,
    },
  });

  return { customer, flagReset, replanned };
}
