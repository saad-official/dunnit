import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { buildCadencePlan } from "@/components/invoices/cadence";
import { CadencePanel } from "@/components/invoices/cadence-panel";
import {
  daysOverdue,
  displayStatus,
  formatCalendarDate,
  formatDay,
  pluralize,
  todayInZone,
} from "@/components/invoices/format";
import { InvoiceStatusActions } from "@/components/invoices/invoice-status-actions";
import { InvoiceTimeline } from "@/components/invoices/invoice-timeline";
import { InvoiceStatusBadge } from "@/components/invoices/status-badge";
import { requireOrgContext } from "@/lib/db/queries";
import { formatCents } from "@/lib/domain/money";
import { loadInvoiceDetail } from "../data";

type Params = Promise<{ id: string }>;

const IdSchema = z.uuid();

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!IdSchema.safeParse(id).success) return { title: "Invoice not found" };
  const { org } = await requireOrgContext();
  const data = await loadInvoiceDetail(org, id);
  return { title: data ? `Invoice ${data.invoice.number}` : "Invoice not found" };
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Added by hand",
  csv: "Imported from CSV",
  demo: "Demo data",
  stripe: "Synced from Stripe",
};

export default async function InvoiceDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!IdSchema.safeParse(id).success) notFound();

  const { org } = await requireOrgContext();
  const data = await loadInvoiceDetail(org, id);
  if (!data) notFound();

  const { invoice, customer, cadence, touches, replies, events, now } = data;
  const timeZone = org.timezone || "UTC";
  const today = todayInZone(now, timeZone);
  const display = displayStatus(invoice.status, invoice.due_at, today);
  const overdue = display === "overdue" ? daysOverdue(invoice.due_at, today) : 0;

  const sentSteps = new Map<number, string>();
  for (const touch of touches) {
    if (touch.status !== "sent" || !touch.sent_at || touch.step < 1) continue;
    const seen = sentSteps.get(touch.step);
    if (!seen || seen < touch.sent_at) sentSteps.set(touch.step, touch.sent_at);
  }
  const plan = buildCadencePlan({ org, invoice, customer, cadence, sentSteps, now });

  return (
    <>
      <Link
        href="/invoices"
        className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Invoices
      </Link>

      <header className="flex flex-col gap-5 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl leading-tight tracking-tight">Invoice #{invoice.number}</h1>
            <InvoiceStatusBadge status={display} />
          </div>
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/customers/${customer.id}`}
              className="font-medium text-foreground underline-offset-3 hover:underline"
            >
              {customer.name}
            </Link>
            {customer.company ? ` · ${customer.company}` : null} · {customer.email}
          </p>
          <p className="money font-display text-4xl leading-none">{formatCents(invoice.amount_cents, invoice.currency)}</p>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-sm">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Issued</dt>
              <dd className="tabular">{formatCalendarDate(invoice.issued_at)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">Due</dt>
              <dd className="tabular">
                {formatCalendarDate(invoice.due_at)}
                {overdue > 0 ? (
                  <span className="font-medium text-amber-foreground dark:text-amber">
                    {" "}
                    · {pluralize(overdue, "day")} overdue
                  </span>
                ) : null}
              </dd>
            </div>
            {invoice.paid_at ? (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular text-moss">{formatDay(invoice.paid_at, timeZone, now)}</dd>
              </div>
            ) : null}
            <div className="flex gap-1.5">
              <dt className="sr-only">Source</dt>
              <dd className="text-muted-foreground">{SOURCE_LABEL[invoice.source] ?? invoice.source}</dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <InvoiceStatusActions invoiceId={invoice.id} number={invoice.number} status={invoice.status} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:order-2 lg:col-span-2">
          <CadencePanel plan={plan} cadence={cadence} riskScore={customer.risk_score} timeZone={timeZone} now={now} />
        </div>
        <section aria-labelledby="timeline-heading" className="min-w-0 lg:order-1 lg:col-span-3">
          <h2 id="timeline-heading" className="mb-4 font-display text-xl">
            Timeline
          </h2>
          <InvoiceTimeline touches={touches} replies={replies} events={events} timeZone={timeZone} />
        </section>
      </div>
    </>
  );
}
