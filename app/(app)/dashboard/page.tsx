import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DsoChart } from "@/components/dashboard/dso-chart";
import { MetricTiles } from "@/components/dashboard/metric-tiles";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { RecoveredChart } from "@/components/dashboard/recovered-chart";
import { getQueueCount, requireOrgContext } from "@/lib/db/queries";
import { loadMetrics, loadRecentActivity } from "@/lib/services/metrics";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { org } = await requireOrgContext();
  const supabase = await createClient();
  const now = new Date();

  const [metrics, activity, queueCount] = await Promise.all([
    loadMetrics(supabase, org.id, now, org.timezone),
    loadRecentActivity(supabase, org.id, 15),
    getQueueCount(org.id),
  ]);

  const header = (
    <PageHeader
      title="Dashboard"
      description="What's owed, what's late, and what Dunnit has brought back."
    />
  );

  if (metrics.invoiceCount === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No invoices yet"
          description="Load demo data to see Dunnit at work on synthetic customers, or import your own invoices from a CSV. Dunnit plans a reminder cadence for each open invoice and drafts the first email when it comes due."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/invoices">Load demo data</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/invoices">Import CSV</Link>
              </Button>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      <MetricTiles metrics={metrics} queueCount={queueCount} />
      <p className="mt-3 text-xs text-muted-foreground">
        Reported in dollars and days, not tokens.
        {metrics.otherCurrencyCount > 0
          ? ` Money figures are in ${metrics.currency}; ${metrics.otherCurrencyCount} invoice${metrics.otherCurrencyCount === 1 ? " in another currency is" : "s in other currencies are"} left out.`
          : null}
      </p>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <DsoChart points={metrics.dsoTrend} />
        <RecoveredChart points={metrics.recoveredPerWeek} currency={metrics.currency} />
      </div>
      <div className="mt-8">
        <RecentActivity events={activity} now={now} />
      </div>
    </>
  );
}
