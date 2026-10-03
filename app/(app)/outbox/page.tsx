import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Outbox" };

export default async function OutboxPage() {
  await requireOrg();

  return (
    <>
      <PageHeader
        title="Outbox"
        description="Every email Dunnit has sent for you, exactly as your customer received it."
      />
      <EmptyState
        title="Nothing sent yet"
        description="Approved drafts are delivered and kept here, so you can always check what went out and when."
        action={
          <Button asChild variant="outline">
            <Link href="/queue">Open the queue</Link>
          </Button>
        }
      />
    </>
  );
}
