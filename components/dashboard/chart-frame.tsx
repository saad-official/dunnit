import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { showTick, weekLabel } from "./chart-utils";

/**
 * Shared chrome for the 12-week charts: a card with a title, a plot area with
 * three recessive gridlines and y labels (rendered in HTML so the text stays
 * legible at any width), week labels underneath, and a visually hidden data
 * table for screen readers. The plot itself is passed as children.
 */
export function ChartFrame({
  id,
  title,
  description,
  yTicks,
  weeks,
  emptyMessage,
  table,
  children,
}: {
  id: string;
  title: string;
  description: string;
  /** Labels for the 0, 50% and 100% gridlines, bottom to top. */
  yTicks: [string, string, string];
  weeks: string[];
  /** When set, the plot is replaced by this message. */
  emptyMessage?: string;
  table: { columns: [string, string]; rows: [string, string][] };
  children: React.ReactNode;
}) {
  const titleId = `${id}-title`;
  return (
    <Card>
      <CardHeader>
        <CardTitle id={titleId} className="font-display text-lg">
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <figure aria-labelledby={titleId} className="m-0">
          <div aria-hidden className="grid grid-cols-[auto_1fr] gap-x-2">
            <div className="relative h-44 w-12 text-right text-[11px] text-muted-foreground tabular">
              {yTicks.map((label, i) => (
                <span
                  key={i}
                  className="absolute right-0 -translate-y-1/2 leading-none"
                  style={{ top: `${100 - i * 50}%` }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="relative h-44">
              {[0, 50, 100].map((pct) => (
                <div
                  key={pct}
                  className={cn("absolute inset-x-0 border-t", pct === 0 ? "border-foreground/25" : "border-dashed border-foreground/10")}
                  style={{ top: `${100 - pct}%` }}
                />
              ))}
              {emptyMessage ? (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </div>
              ) : (
                children
              )}
            </div>
            <div />
            <div className="mt-2 grid text-center text-[11px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
              {weeks.map((week, i) => (
                <span key={week} className="truncate">
                  {showTick(i, weeks.length) ? weekLabel(week) : ""}
                </span>
              ))}
            </div>
          </div>
          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">{table.columns[0]}</th>
                <th scope="col">{table.columns[1]}</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map(([a, b]) => (
                <tr key={a}>
                  <th scope="row">{a}</th>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      </CardContent>
    </Card>
  );
}
