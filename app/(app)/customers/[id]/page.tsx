import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { ContactBadges } from "@/components/customers/contact-badges";
import { CustomerForm } from "@/components/customers/customer-form";
import { CustomerInvoices } from "@/components/customers/customer-invoices";
import { Balance } from "@/components/customers/customer-list";
import { requireOrgContext } from "@/lib/db/queries";
import { loadCustomerDetail } from "../data";

type Params = Promise<{ id: string }>;

const IdSchema = z.uuid();

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!IdSchema.safeParse(id).success) return { title: "Customer not found" };
  const { org } = await requireOrgContext();
  const data = await loadCustomerDetail(org, id);
  return { title: data ? data.customer.name : "Customer not found" };
}

export default async function CustomerDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!IdSchema.safeParse(id).success) notFound();

  const { org } = await requireOrgContext();
  const data = await loadCustomerDetail(org, id);
  if (!data) notFound();

  const { customer, invoices, openBalance, now } = data;
  const timeZone = org.timezone || "UTC";

  return (
    <>
      <Link
        href="/customers"
        className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Customers
      </Link>

      <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="font-display text-3xl leading-tight tracking-tight break-words">{customer.name}</h1>
          <p className="text-sm break-words text-muted-foreground">
            {customer.company ? `${customer.company} · ` : null}
            {customer.email}
          </p>
          <ContactBadges doNotContact={customer.do_not_contact} contactFlag={customer.contact_flag} />
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Open balance</p>
          <div className="mt-1 font-display text-3xl leading-none">
            <Balance balances={openBalance} className="justify-items-start sm:justify-items-end" />
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-5">
        <section aria-labelledby="details-heading" className="min-w-0 lg:col-span-3">
          <h2 id="details-heading" className="mb-4 font-display text-xl">
            Details
          </h2>
          <div className="rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 sm:p-5">
            <CustomerForm customer={customer} />
          </div>
        </section>
        <section aria-labelledby="invoices-heading" className="min-w-0 lg:col-span-2">
          <h2 id="invoices-heading" className="mb-4 font-display text-xl">
            Invoices <span className="tabular text-base text-muted-foreground">({invoices.length})</span>
          </h2>
          <CustomerInvoices invoices={invoices} timeZone={timeZone} now={now} />
        </section>
      </div>
    </>
  );
}
