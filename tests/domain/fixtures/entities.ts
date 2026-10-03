import type { Cadence, Customer, Invoice, Organization, Touch } from "@/lib/domain/types";

export function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org_1",
    name: "Harbor Design Co",
    timezone: "America/New_York",
    voice: { businessName: "Harbor Design Co", signature: "Maya, Harbor Design Co", toneNotes: "warm, brief" },
    autonomy: "auto_step1",
    plan: "pro",
    ...overrides,
  };
}

export function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cus_1",
    orgId: "org_1",
    name: "Jordan Lee",
    email: "jordan@example.com",
    company: "Lee Plumbing",
    riskScore: 50,
    doNotContact: false,
    ...overrides,
  };
}

export function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv_1",
    orgId: "org_1",
    customerId: "cus_1",
    number: "INV-1042",
    amountCents: 123450,
    currency: "USD",
    issuedAt: "2026-09-01",
    dueAt: "2026-10-01",
    status: "open",
    ...overrides,
  };
}

export function makeCadence(overrides: Partial<Cadence> = {}): Cadence {
  return {
    id: "cad_1",
    invoiceId: "inv_1",
    step: 1,
    nextRunAt: new Date("2026-10-08T13:00:00Z"),
    status: "active",
    ...overrides,
  };
}

export function makeTouch(overrides: Partial<Touch> = {}): Touch {
  return {
    id: "tch_1",
    invoiceId: "inv_1",
    step: 1,
    tone: "friendly",
    subject: "Invoice INV-1042",
    body: "Hello",
    status: "sent",
    confidence: 0.9,
    sentAt: new Date("2026-10-02T13:00:00Z"),
    ...overrides,
  };
}
