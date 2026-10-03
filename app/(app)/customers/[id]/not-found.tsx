import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export default function CustomerNotFound() {
  return (
    <EmptyState
      title="Customer not found"
      description="They may have been removed with the demo data, or they belong to another organization."
      action={
        <Button asChild>
          <Link href="/customers">Back to customers</Link>
        </Button>
      }
    />
  );
}
