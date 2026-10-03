import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  await requireOrg();

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every invoice you're owed, and where its reminder cadence stands."
      />
      <EmptyState
        title="No invoices yet"
        description="Add one by hand, upload a CSV (number, customer, email, amount, currency, issued and due dates), or load demo data to see Dunnit at work."
      />
    </>
  );
}
