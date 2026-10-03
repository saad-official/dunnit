import Link from "next/link";
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
import { ContactBadges } from "./contact-badges";
import { RiskMeter } from "./risk-meter";

export type CustomerRowView = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  risk_score: number;
  do_not_contact: boolean;
  contact_flag: string;
  openBalance: { currency: string; cents: number }[];
  invoiceCount: number;
};

export function Balance({
  balances,
  className,
}: {
  balances: CustomerRowView["openBalance"];
  className?: string;
}) {
  if (balances.length === 0) {
    return <span className={cn("money text-muted-foreground", className)}>{formatCents(0)}</span>;
  }
  return (
    <span className={cn("grid justify-items-end gap-0.5", className)}>
      {balances.map((b) => (
        <span key={b.currency} className="money">
          {formatCents(b.cents, b.currency)}
        </span>
      ))}
    </span>
  );
}

export function CustomerList({ rows }: { rows: CustomerRowView[] }) {
  return (
    <>
      {/* Phone: stacked cards. */}
      <ul className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/customers/${row.id}`}
              className="block rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{row.company ?? row.email}</p>
                </div>
                <div className="shrink-0 text-right font-display text-lg leading-tight">
                  <Balance balances={row.openBalance} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <RiskMeter score={row.risk_score} />
                <span className="text-xs text-muted-foreground">
                  {row.invoiceCount} {row.invoiceCount === 1 ? "invoice" : "invoices"}
                </span>
              </div>
              <ContactBadges doNotContact={row.do_not_contact} contactFlag={row.contact_flag} className="mt-2" />
            </Link>
          </li>
        ))}
      </ul>

      {/* Tablet and up: table. */}
      <div className="hidden overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-foreground/10 md:block">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Customer</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Open balance</TableHead>
              <TableHead className="pr-4 text-right">Invoices</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="relative">
                <TableCell className="max-w-56 pl-4">
                  <Link
                    href={`/customers/${row.id}`}
                    className="block truncate font-medium outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                  >
                    {row.name}
                  </Link>
                  {row.company ? <span className="block truncate text-xs text-muted-foreground">{row.company}</span> : null}
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">{row.email}</TableCell>
                <TableCell>
                  <RiskMeter score={row.risk_score} />
                </TableCell>
                <TableCell>
                  <ContactBadges doNotContact={row.do_not_contact} contactFlag={row.contact_flag} />
                </TableCell>
                <TableCell className="text-right">
                  <Balance balances={row.openBalance} />
                </TableCell>
                <TableCell className="tabular pr-4 text-right text-muted-foreground">{row.invoiceCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
