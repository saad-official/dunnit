import { cn } from "@/lib/utils";
import { MockFrame } from "./mock-frame";

const tiles = [
  {
    label: "Recovered after agent touch",
    value: "$12,480",
    note: "11 invoices paid after a reminder",
    recovered: true,
  },
  { label: "Promise kept", value: "78%", note: "18 of 23 promises" },
  { label: "Median days to pay", value: "9", note: "counted from the due date" },
  { label: "Queue", value: "3", note: "drafts waiting for you" },
];

/** The dashboard's top tile row. Moss is reserved for money recovered. */
export function DashboardTilesMock() {
  return (
    <MockFrame caption="Fig. 2. The dashboard tile row for a demo workspace, last 90 days. Synthetic data.">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card lg:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={cn(
              "flex min-w-0 flex-col bg-card p-4 sm:p-5",
              "before:mb-4 before:block before:h-0.5 before:w-6 before:content-['']",
              t.recovered ? "before:bg-moss" : "before:bg-border",
            )}
          >
            <dt className="text-xs leading-snug text-muted-foreground">{t.label}</dt>
            <dd className={cn("money mt-2 text-[1.75rem] leading-none font-semibold sm:text-3xl", t.recovered && "text-moss")}>
              {t.value}
            </dd>
            <dd className="mt-2 text-xs leading-snug text-muted-foreground">{t.note}</dd>
          </div>
        ))}
      </dl>
    </MockFrame>
  );
}
