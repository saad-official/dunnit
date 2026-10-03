import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Queue" };

export default async function QueuePage() {
  await requireOrg();

  return (
    <>
      <PageHeader
        title="Queue"
        description="Drafted emails waiting for you. Approve, edit, reject with a reason, or snooze."
      />
      <EmptyState
        title="Nothing to approve."
        description="Drafts appear here when a cadence step comes due."
        action={
          <Button asChild variant="outline">
            <Link href="/invoices">View invoices</Link>
          </Button>
        }
      />
    </>
  );
}
