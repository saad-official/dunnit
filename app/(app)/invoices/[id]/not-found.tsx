import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export default function InvoiceNotFound() {
  return (
    <EmptyState
      title="Invoice not found"
      description="It may have been removed with the demo data, or it belongs to another organization."
      action={
        <Button asChild>
          <Link href="/invoices">Back to invoices</Link>
        </Button>
      }
    />
  );
}
