import "server-only";
import { logAgentEvent } from "@/lib/ai/log";
import { toDomainCadence, toDomainInvoice } from "@/lib/db/mappers";
import type { Organization as OrganizationRow } from "@/lib/db/types";
import { addDaysToIsoDate, isoDateInZone, zonedTimeToUtc } from "@/lib/domain/dates";
import { handleReply } from "@/lib/domain/replies";
import type { ReplyClassification, Tone } from "@/lib/domain/types";
import { applyOutcome } from "@/lib/services/replies";
import { createInvoice, upsertCustomer } from "@/lib/services/invoices";
import { unwrap, type Client } from "@/lib/services/shared";

/**
 * Synthetic data that exercises every state the product has: invoices not yet
 * due, overdue with cadences about to fire, paid after an agent touch, a
 * promise to pay, a dispute, an open question. All names and amounts are made
 * up. Marked `source = 'demo'` so it can be removed in one statement.
 */

type DemoCustomer = { key: string; name: string; email: string; company: string; riskScore: number };

const CUSTOMERS: DemoCustomer[] = [
  { key: "harbor", name: "Maya Chen", email: "maya@harborlane.example", company: "Harbor Lane Studio", riskScore: 15 },
  { key: "pinecrest", name: "Dr. Tunde Okafor", email: "office@pinecrestdental.example", company: "Pinecrest Dental", riskScore: 35 },
  { key: "northwind", name: "Sam Patel", email: "ap@northwindlogistics.example", company: "Northwind Logistics", riskScore: 60 },
  { key: "bluebird", name: "Lena Fischer", email: "lena@bluebirdbakery.example", company: "Bluebird Bakery", riskScore: 25 },
  { key: "atlas", name: "Jordan Reyes", email: "jordan@atlasfitness.example", company: "Atlas Fitness", riskScore: 80 },
  { key: "oakridge", name: "Priya Nair", email: "accounts@oakridgeconsulting.example", company: "Oakridge Consulting", riskScore: 40 },
];

type SentTouch = { step: number; tone: Tone; daysAgo: number; subject: string; body: string };
type DemoReply = { daysAgo: number; text: string; classification: ReplyClassification };

type DemoInvoice = {
  customer: string;
  number: string;
  amountCents: number;
  dueInDays: number; // negative = overdue
  issuedDaysBeforeDue: number;
  paidDaysAgo?: number;
  touches?: SentTouch[];
  reply?: DemoReply;
};

const INVOICES: DemoInvoice[] = [
  {
    customer: "harbor",
    number: "1042",
    amountCents: 235_000,
    dueInDays: -9,
    issuedDaysBeforeDue: 30,
    touches: [touch(1, "friendly", 8, "1042", "$2,350.00", "Maya")],
    reply: {
      daysAgo: 7,
      text: "Hi, sorry about that, it slipped past us during the move. We'll get it paid on the 15th when our next run goes out. Thanks for your patience.",
      classification: {
        intent: "promise_to_pay",
        promiseDate: "__PROMISE__",
        amountCents: null,
        summary: "Customer apologised and committed to paying on the 15th.",
        suggestedAction: "No action needed; check back the day after the promised date.",
        confidence: 0.92,
      },
    },
  },
  {
    customer: "pinecrest",
    number: "1037",
    amountCents: 480_000,
    dueInDays: -16,
    issuedDaysBeforeDue: 30,
    touches: [touch(1, "friendly", 15, "1037", "$4,800.00", "Dr. Okafor"), touch(2, "firm", 9, "1037", "$4,800.00", "Dr. Okafor")],
  },
  { customer: "northwind", number: "1051", amountCents: 127_500, dueInDays: -3, issuedDaysBeforeDue: 14 },
  {
    customer: "bluebird",
    number: "1029",
    amountCents: 64_000,
    dueInDays: -40,
    issuedDaysBeforeDue: 30,
    paidDaysAgo: 31,
    touches: [touch(1, "friendly", 39, "1029", "$640.00", "Lena"), touch(2, "firm", 33, "1029", "$640.00", "Lena")],
  },
  {
    customer: "oakridge",
    number: "1033",
    amountCents: 320_000,
    dueInDays: -30,
    issuedDaysBeforeDue: 30,
    paidDaysAgo: 24,
    touches: [touch(1, "friendly", 29, "1033", "$3,200.00", "Priya")],
  },
  {
    customer: "atlas",
    number: "1046",
    amountCents: 198_000,
    dueInDays: -12,
    issuedDaysBeforeDue: 30,
    touches: [touch(2, "firm", 11, "1046", "$1,980.00", "Jordan")],
    reply: {
      daysAgo: 10,
      text: "We're not paying this. The second session in March was cancelled by your side and we were still billed for it. Send a corrected invoice.",
      classification: {
        intent: "dispute",
        promiseDate: null,
        amountCents: null,
        summary: "Customer disputes the invoice: says a cancelled March session was billed.",
        suggestedAction: "Check the March session record and issue a corrected invoice or explain the charge.",
        confidence: 0.95,
      },
    },
  },
  { customer: "harbor", number: "1055", amountCents: 110_000, dueInDays: 12, issuedDaysBeforeDue: 30 },
  { customer: "bluebird", number: "1056", amountCents: 42_000, dueInDays: 5, issuedDaysBeforeDue: 14 },
  {
    customer: "oakridge",
    number: "1048",
    amountCents: 275_000,
    dueInDays: -20,
    issuedDaysBeforeDue: 30,
    touches: [touch(1, "friendly", 19, "1048", "$2,750.00", "Priya"), touch(2, "firm", 13, "1048", "$2,750.00", "Priya")],
    reply: {
      daysAgo: 12,
      text: "Could you resend the PDF? Our finance inbox rejected the attachment and I can't find the original.",
      classification: {
        intent: "question",
        promiseDate: null,
        amountCents: null,
        summary: "Customer asks for the invoice PDF to be resent.",
        suggestedAction: "Resend the PDF to accounts@oakridgeconsulting.example and resume the cadence.",
        confidence: 0.9,
      },
    },
  },
  {
    customer: "northwind",
    number: "1021",
    amountCents: 540_000,
    dueInDays: -75,
    issuedDaysBeforeDue: 30,
    paidDaysAgo: 58,
    touches: [
      touch(1, "friendly", 74, "1021", "$5,400.00", "Sam"),
      touch(2, "firm", 68, "1021", "$5,400.00", "Sam"),
      touch(3, "formal", 61, "1021", "$5,400.00", "Sam"),
    ],
  },
];

export type SeedResult = { skipped: boolean; customers: number; invoices: number };

export async function seedDemoData(client: Client, org: OrganizationRow, now = new Date()): Promise<SeedResult> {
  const existing = await client.from("invoices").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("source", "demo");
  if ((existing.count ?? 0) > 0) return { skipped: true, customers: 0, invoices: 0 };

  const tz = org.timezone || "UTC";
  const today = isoDateInZone(now, tz);
  const customers = new Map<string, Awaited<ReturnType<typeof upsertCustomer>>>();
  for (const c of CUSTOMERS) {
    customers.set(c.key, await upsertCustomer(client, org.id, c));
  }

  let count = 0;
  for (const spec of INVOICES) {
    const customer = customers.get(spec.customer)!;
    const dueAt = addDaysToIsoDate(today, spec.dueInDays);
    const issuedAt = addDaysToIsoDate(dueAt, -spec.issuedDaysBeforeDue);
    const paidAt = spec.paidDaysAgo !== undefined ? zonedTimeToUtc(addDaysToIsoDate(today, -spec.paidDaysAgo), 14, 0, tz) : null;

    const invoice = await createInvoice(
      client,
      org,
      customer,
      {
        customerId: customer.id,
        number: spec.number,
        amountCents: spec.amountCents,
        currency: "USD",
        issuedAt,
        dueAt,
        source: "demo",
        status: paidAt ? "paid" : "open",
        paidAt: paidAt ? paidAt.toISOString() : null,
      },
      now,
      "system",
    );
    count++;

    const cadence = unwrap(await client.from("cadences").select("*").eq("invoice_id", invoice.id).single(), "load cadence");
    const lastStep = spec.touches?.at(-1)?.step ?? 0;

    for (const t of spec.touches ?? []) {
      const sentAt = zonedTimeToUtc(addDaysToIsoDate(today, -t.daysAgo), 9, 5, tz);
      await client.from("touches").insert({
        org_id: org.id,
        invoice_id: invoice.id,
        cadence_id: cadence.id,
        step: t.step,
        tone: t.tone,
        subject: t.subject,
        body: t.body,
        status: "sent",
        confidence: 0.84,
        rationale: "Demo history.",
        approved_at: sentAt.toISOString(),
        sent_at: sentAt.toISOString(),
        created_at: sentAt.toISOString(),
      });
    }

    if (paidAt) {
      await client
        .from("cadences")
        .update({ step: lastStep, status: "stopped", next_run_at: null, pause_reason: "paid" })
        .eq("id", cadence.id);
      continue;
    }

    if (lastStep > 0) {
      // Reflect sent history: next planned step is due now for the overdue ones.
      const nextRun = zonedTimeToUtc(today, 9, 0, tz);
      await client.from("cadences").update({ step: lastStep, next_run_at: nextRun.toISOString() }).eq("id", cadence.id);
    }

    if (spec.reply) {
      const receivedAt = zonedTimeToUtc(addDaysToIsoDate(today, -spec.reply.daysAgo), 11, 30, tz);
      const classification: ReplyClassification = {
        ...spec.reply.classification,
        promiseDate:
          spec.reply.classification.promiseDate === "__PROMISE__"
            ? addDaysToIsoDate(today, 3)
            : spec.reply.classification.promiseDate,
      };
      const lastTouch = await client
        .from("touches")
        .select("id")
        .eq("invoice_id", invoice.id)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      await client.from("replies").insert({
        org_id: org.id,
        invoice_id: invoice.id,
        touch_id: lastTouch.data?.id ?? null,
        from_email: customer.email,
        raw_text: spec.reply.text,
        received_at: receivedAt.toISOString(),
        classification,
        intent: classification.intent,
        simulated: true,
      });
      const freshCadence = unwrap(await client.from("cadences").select("*").eq("id", cadence.id).single(), "reload cadence");
      const outcome = handleReply(classification, toDomainInvoice(invoice), toDomainCadence(freshCadence), receivedAt, { timezone: tz });
      await applyOutcome(client, { orgId: org.id, invoiceId: invoice.id, customerId: customer.id, cadenceId: cadence.id }, outcome);
    }
  }

  await logAgentEvent(client, {
    orgId: org.id,
    actor: "system",
    type: "demo.seeded",
    output: { customers: CUSTOMERS.length, invoices: count },
  });

  return { skipped: false, customers: CUSTOMERS.length, invoices: count };
}

/** Removes everything the seeder created. */
export async function clearDemoData(client: Client, orgId: string): Promise<number> {
  const { data, error } = await client.from("invoices").delete().eq("org_id", orgId).eq("source", "demo").select("id");
  if (error) throw new Error(`clear demo invoices: ${error.message}`);
  const emails = CUSTOMERS.map((c) => c.email);
  await client.from("customers").delete().eq("org_id", orgId).in("email", emails);
  return data.length;
}

function touch(step: number, tone: Tone, daysAgo: number, number: string, amount: string, firstName: string): SentTouch {
  const subjects: Record<Tone, string> = {
    friendly: `Quick one on invoice ${number}`,
    firm: `Invoice ${number} is now overdue`,
    formal: `Invoice ${number}: payment required`,
    final: `Final notice: invoice ${number}`,
  };
  const bodies: Record<Tone, string> = {
    friendly: `Hi ${firstName},\n\nJust a quick note that invoice ${number} for ${amount} came due recently. It may have slipped through, so I wanted to flag it. Happy to resend the PDF if that helps.\n\nThanks,\nAvery`,
    firm: `Hi ${firstName},\n\nInvoice ${number} for ${amount} is now past due and I haven't heard back. Could you let me know when payment will go out? If anything is holding it up on your side, tell me and I'll sort it.\n\nThanks,\nAvery`,
    formal: `Hello ${firstName},\n\nFollowing my earlier reminders, invoice ${number} for ${amount} remains unpaid. Please arrange payment within the next 7 days, or reply with a date I can plan around.\n\nRegards,\nAvery`,
    final: `Hello ${firstName},\n\nThis is my final reminder about invoice ${number} for ${amount}. After this I'll review next steps personally. I'd much rather we settle it between us.\n\nRegards,\nAvery`,
  };
  return { step, tone, daysAgo, subject: subjects[tone], body: bodies[tone] };
}
