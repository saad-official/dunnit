import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  await requireOrg();

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Customer replies, read and sorted by intent: paid, promise to pay, dispute, question and more."
      />
      <EmptyState
        title="No replies yet"
        description="When a customer answers a reminder, Dunnit reads it, pauses the cadence and suggests what to do next. You can also paste a reply or simulate one to see how it's handled."
      />
    </>
  );
}
