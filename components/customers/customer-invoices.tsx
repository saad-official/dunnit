import Link from "next/link";
import { describeCadence, type CadenceStateInput } from "@/components/invoices/cadence";
import { formatCalendarDate, type DisplayStatus } from "@/components/invoices/format";
import { InvoiceStatusBadge } from "@/components/invoices/status-badge";
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

export type CustomerInvoiceView = {
  id: string;
  number: string;
  amountCents: number;
  currency: string;
  dueAt: string;
  display: DisplayStatus;
  cadence: CadenceStateInput | null;
};

export function CustomerInvoices({
  invoices,
  timeZone,
  now,
}: {
  invoices: CustomerInvoiceView[];
  timeZone: string;
  now: Date;
}) {
  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">No invoices for this customer yet.</p>;
  }
  return (
    <ul className="divide-y overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-foreground/10">
      {invoices.map((invoice) => {
        const cadence = describeCadence(invoice.cadence, timeZone, now);
        return (
          <li key={invoice.id}>
            <Link
              href={`/invoices/${invoice.id}`}
              className="block px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">#{invoice.number}</span>
                <span className="money">{formatCents(invoice.amountCents, invoice.currency)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <InvoiceStatusBadge status={invoice.display} />
                <span className="text-muted-foreground">Due {formatCalendarDate(invoice.dueAt)}</span>
              </div>
              <p
                className={cn(
                  "mt-1 text-xs text-muted-foreground",
                  cadence.tone === "attention" && "text-amber-foreground dark:text-amber",
                )}
              >
                {cadence.label}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
