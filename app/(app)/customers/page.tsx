import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { CustomerList } from "@/components/customers/customer-list";
import { requireOrgContext } from "@/lib/db/queries";
import { loadCustomerList } from "./data";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const { org } = await requireOrgContext();
  const customers = await loadCustomerList(org);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Who owes you, how reliably they pay, and whether Dunnit may contact them."
        actions={<AddCustomerDialog />}
      />
      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Customers are added with their invoices, or by hand here. Each gets a risk score that tunes how firmly Dunnit follows up, and you can mark anyone as do-not-contact."
        />
      ) : (
        <CustomerList rows={customers} />
      )}
    </>
  );
}
