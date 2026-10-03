import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import { describeCadence, type CadenceStateInput } from "./cadence";
import { formatCalendarDate, pluralize, type DisplayStatus } from "./format";
import { InvoiceStatusBadge } from "./status-badge";

export type InvoiceRowView = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  amountCents: number;
  currency: string;
  dueAt: string;
  display: DisplayStatus;
  overdueDays: number;
  cadence: CadenceStateInput | null;
  sentTouchCount: number;
};

export type SortControl = {
  key: "due" | "amount";
  label: string;
  href: string;
  /** Current direction when this column is the active sort. */
  active: "asc" | "desc" | null;
};

function DueCell({ row }: { row: InvoiceRowView }) {
  return (
    <div className="grid gap-0.5">
      <span className="tabular">{formatCalendarDate(row.dueAt)}</span>
      {row.display === "overdue" ? (
        <span className="text-xs font-medium text-amber-foreground dark:text-amber">
          {pluralize(row.overdueDays, "day")} overdue
        </span>
      ) : null}
    </div>
  );
}

function CadenceCell({ row, timeZone, now }: { row: InvoiceRowView; timeZone: string; now: Date }) {
  const state = describeCadence(row.cadence, timeZone, now);
  return (
    <span
      className={cn(
        "text-sm",
        state.tone === "muted" && "text-muted-foreground",
        state.tone === "attention" && "text-amber-foreground dark:text-amber",
      )}
    >
      {state.label}
    </span>
  );
}

function SortHeader({ control, className }: { control: SortControl; className?: string }) {
  const Icon = control.active === "asc" ? ArrowUp : control.active === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead
      className={className}
      aria-sort={control.active === "asc" ? "ascending" : control.active === "desc" ? "descending" : undefined}
    >
      <Link
        href={control.href}
        scroll={false}
        className={cn(
          "inline-flex items-center gap-1 rounded-md outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          !control.active && "text-muted-foreground",
        )}
      >
        {control.label}
        <Icon className="size-3.5" aria-hidden />
      </Link>
    </TableHead>
  );
}

export function InvoiceList({
  rows,
  sortControls,
  timeZone,
  now,
}: {
  rows: InvoiceRowView[];
  sortControls: { due: SortControl; amount: SortControl };
  timeZone: string;
  now: Date;
}) {
  return (
    <>
      {/* Phone: stacked cards. */}
      <div className="flex items-center gap-3 pb-2 text-xs text-muted-foreground md:hidden">
        <span>Sort:</span>
        {[sortControls.due, sortControls.amount].map((control) => (
          <Link
            key={control.key}
            href={control.href}
            scroll={false}
            className={cn("inline-flex items-center gap-1 rounded-md py-1", control.active && "font-medium text-foreground")}
          >
            {control.label}
            {control.active === "asc" ? (
              <ArrowUp className="size-3" aria-label="ascending" />
            ) : control.active === "desc" ? (
              <ArrowDown className="size-3" aria-label="descending" />
            ) : null}
          </Link>
        ))}
      </div>
      <ul className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/invoices/${row.id}`}
              className="block rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">#{row.number}</p>
                  <p className="truncate text-sm text-muted-foreground">{row.customerName}</p>
                </div>
                <p className="money shrink-0 font-display text-lg leading-tight">
                  {formatCents(row.amountCents, row.currency)}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <InvoiceStatusBadge status={row.display} />
                  <span className="text-muted-foreground">
                    Due <DueInline row={row} />
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{pluralize(row.sentTouchCount, "touch", "touches")} sent</span>
              </div>
              <div className="mt-2">
                <CadenceCell row={row} timeZone={timeZone} now={now} />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Tablet and up: table. */}
      <div className="hidden overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-foreground/10 md:block">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <SortHeader control={sortControls.amount} className="text-right [&>a]:justify-end" />
              <SortHeader control={sortControls.due} />
              <TableHead>Status</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead className="pr-4 text-right">Sent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="relative">
                <TableCell className="pl-4 font-medium">
                  <Link
                    href={`/invoices/${row.id}`}
                    className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                  >
                    #{row.number}
                  </Link>
                </TableCell>
                <TableCell className="max-w-48 truncate">{row.customerName}</TableCell>
                <TableCell className="money text-right">{formatCents(row.amountCents, row.currency)}</TableCell>
                <TableCell>
                  <DueCell row={row} />
                </TableCell>
                <TableCell>
                  <InvoiceStatusBadge status={row.display} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <CadenceCell row={row} timeZone={timeZone} now={now} />
                </TableCell>
                <TableCell className="tabular pr-4 text-right text-muted-foreground">{row.sentTouchCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function DueInline({ row }: { row: InvoiceRowView }) {
  return (
    <>
      <span className="tabular">{formatCalendarDate(row.dueAt)}</span>
      {row.display === "overdue" ? (
        <span className="font-medium text-amber-foreground dark:text-amber"> · {row.overdueDays}d overdue</span>
      ) : null}
    </>
  );
}
