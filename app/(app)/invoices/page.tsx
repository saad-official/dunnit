import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { InvoiceHeaderActions } from "@/components/invoices/invoice-header-actions";
import { InvoiceList, type SortControl } from "@/components/invoices/invoice-list";
import { requireOrgContext } from "@/lib/db/queries";
import { addDaysToIsoDate } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import {
  FILTER_LABELS,
  loadInvoiceList,
  matchesFilter,
  sortItems,
  STATUS_FILTERS,
  type SortDir,
  type SortKey,
  type StatusFilter,
} from "./data";

export const metadata: Metadata = { title: "Invoices" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilter(value: string | undefined): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value ?? "") ? (value as StatusFilter) : "all";
}

function hrefFor(params: { status: StatusFilter; sort: SortKey; dir: SortDir }): string {
  const search = new URLSearchParams();
  if (params.status !== "all") search.set("status", params.status);
  if (params.sort !== "due" || params.dir !== "asc") {
    search.set("sort", params.sort);
    search.set("dir", params.dir);
  }
  const query = search.toString();
  return query ? `/invoices?${query}` : "/invoices";
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { org, role } = await requireOrgContext();
  const params = await searchParams;
  const status = parseFilter(first(params.status));
  const sort: SortKey = first(params.sort) === "amount" ? "amount" : "due";
  const dir: SortDir = first(params.dir) === "desc" ? "desc" : "asc";

  const data = await loadInvoiceList(org);
  const counts = Object.fromEntries(
    STATUS_FILTERS.map((f) => [f, data.items.filter((item) => matchesFilter(item, f)).length]),
  ) as Record<StatusFilter, number>;
  const rows = sortItems(
    data.items.filter((item) => matchesFilter(item, status)),
    sort,
    dir,
  );

  const sortControl = (key: SortKey, label: string): SortControl => {
    const active = sort === key ? dir : null;
    // First click sorts ascending (amount: largest first is more useful, so start descending).
    const nextDir: SortDir = active ? (active === "asc" ? "desc" : "asc") : key === "amount" ? "desc" : "asc";
    return { key, label, active, href: hrefFor({ status, sort: key, dir: nextDir }) };
  };

  const { capacity } = data;
  const timeZone = org.timezone || "UTC";

  const actions = (
    <InvoiceHeaderActions
      customers={data.customers}
      today={data.today}
      netThirty={addDaysToIsoDate(data.today, 30)}
      atLimit={capacity.atLimit}
      remaining={capacity.remaining}
      hasDemoData={data.hasDemoData}
      canRemoveDemo={role === "owner"}
    />
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description={
          <>
            Every invoice you&apos;re owed, and where its reminder cadence stands.
            {capacity.limit !== null ? (
              <span className="mt-1 block text-xs">
                Free plan: {capacity.active} of {capacity.limit} active invoices used.
              </span>
            ) : null}
          </>
        }
        actions={actions}
      />

      {capacity.atLimit ? (
        <p
          role="status"
          className="mb-6 rounded-xl border border-amber/50 bg-accent px-4 py-3 text-sm text-amber-foreground"
        >
          You&apos;ve reached the Free plan&apos;s {capacity.limit} active invoices, so adding and importing are
          paused. Mark invoices paid or written off to free up room, or{" "}
          <Link href="/billing" className="font-medium underline underline-offset-3">
            upgrade to Pro
          </Link>{" "}
          for unlimited invoices.
        </p>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Add one by hand, upload a CSV (number, customer, email, amount, currency, issued and due dates), or load demo data to see Dunnit at work."
        />
      ) : (
        <>
          <nav aria-label="Filter invoices by status" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex w-max gap-1 rounded-lg bg-muted p-[3px]">
              {STATUS_FILTERS.map((filter) => {
                const active = filter === status;
                return (
                  <li key={filter}>
                    <Link
                      href={hrefFor({ status: filter, sort, dir })}
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-foreground/60 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                        active && "bg-background text-foreground shadow-sm",
                      )}
                    >
                      {FILTER_LABELS[filter]}
                      <span
                        className={cn(
                          "tabular rounded-full px-1.5 text-xs",
                          filter === "overdue" && counts.overdue > 0
                            ? "bg-amber text-amber-foreground"
                            : "bg-secondary text-secondary-foreground",
                        )}
                      >
                        {counts[filter]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {rows.length === 0 ? (
            <EmptyState
              className="py-10"
              title={`No ${FILTER_LABELS[status].toLowerCase()} invoices`}
              description={
                <Link href={hrefFor({ status: "all", sort, dir })} className="underline underline-offset-3">
                  Show all invoices
                </Link>
              }
            />
          ) : (
            <InvoiceList
              rows={rows}
              sortControls={{ due: sortControl("due", "Due"), amount: sortControl("amount", "Amount") }}
              timeZone={timeZone}
              now={data.now}
            />
          )}
        </>
      )}
    </>
  );
}
