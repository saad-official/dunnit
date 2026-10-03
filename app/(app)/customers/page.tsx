import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireOrg();

  return (
    <>
      <PageHeader
        title="Customers"
        description="Who owes you, how reliably they pay, and whether Dunnit may contact them."
      />
      <EmptyState
        title="No customers yet"
        description="Customers are added with their invoices. Each gets a risk score that tunes how firmly Dunnit follows up, and you can mark anyone as do-not-contact."
      />
    </>
  );
}
