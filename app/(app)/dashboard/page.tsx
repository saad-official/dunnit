import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { MetricTile } from "@/components/app/metric-tile";
import { PageHeader } from "@/components/app/page-header";
import { getQueueCount, requireOrg } from "@/lib/db/queries";
import { formatCents } from "@/lib/domain/money";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const org = await requireOrg();
  const queueCount = await getQueueCount(org.id);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What's owed, what's late, and what Dunnit has brought back."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Outstanding" value={formatCents(0)} caption="Across open invoices" />
        <MetricTile label="Overdue" value={formatCents(0)} caption="Past due date, still open" />
        <MetricTile
          label="Recovered"
          value={formatCents(0)}
          caption="Paid after a Dunnit touch"
          tone="positive"
        />
        <MetricTile
          label="Awaiting approval"
          value={String(queueCount)}
          caption={queueCount === 1 ? "Draft in your queue" : "Drafts in your queue"}
          tone={queueCount > 0 ? "attention" : "default"}
        />
      </div>
      <EmptyState
        className="mt-8"
        title="No invoices yet"
        description="Add an invoice, import a CSV, or load demo data. Dunnit plans a reminder cadence for each open invoice and drafts the first email when it comes due."
        action={
          <Button asChild>
            <Link href="/invoices">Add invoices</Link>
          </Button>
        }
      />
    </>
  );
}
