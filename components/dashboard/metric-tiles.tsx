import Link from "next/link";
import { MetricTile } from "@/components/app/metric-tile";
import { formatCents } from "@/lib/domain/money";
import type { DashboardMetrics } from "@/lib/services/metrics";

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function formatDays(days: number | null): string {
  if (days === null) return "—";
  const rounded = Math.round(days * 10) / 10;
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}

export function MetricTiles({ metrics, queueCount }: { metrics: DashboardMetrics; queueCount: number }) {
  const money = (cents: number) => formatCents(cents, metrics.currency);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MetricTile label="Outstanding" value={money(metrics.outstandingCents)} caption="Open, disputed or awaiting verification" />
      <MetricTile
        label="Overdue"
        value={money(metrics.overdueCents)}
        caption="Past due date, still unpaid"
        tone={metrics.overdueCents > 0 ? "attention" : "default"}
      />
      <MetricTile
        label="Recovered after agent touch"
        value={money(metrics.recoveredAfterTouchCents)}
        caption="Paid after at least one Dunnit email"
        tone="positive"
      />
      <MetricTile
        label="Promise-kept rate"
        value={formatRate(metrics.promiseKeptRate)}
        caption={
          metrics.promiseKeptRate === null
            ? "No promise-to-pay has come due yet"
            : "Promises paid by the promised date + 3 days"
        }
      />
      <MetricTile
        label="Median days to pay"
        value={formatDays(metrics.medianDaysToPay)}
        caption={metrics.medianDaysToPay === null ? "No paid invoices yet" : "From issue date to payment"}
      />
      <Link
        href="/queue"
        className="rounded-xl outline-none transition-transform hover:-translate-y-px focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`In queue: ${queueCount} ${queueCount === 1 ? "draft" : "drafts"} awaiting approval. Open the approval queue.`}
      >
        <MetricTile
          className="h-full hover:ring-foreground/20"
          label="In queue"
          value={String(queueCount)}
          caption={queueCount === 1 ? "Draft awaiting your approval →" : "Drafts awaiting your approval →"}
          tone={queueCount > 0 ? "attention" : "default"}
        />
      </Link>
    </div>
  );
}
