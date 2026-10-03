import type { DsoPoint } from "@/lib/domain/metrics";
import { ChartFrame } from "./chart-frame";
import { niceMax, weekLabelLong } from "./chart-utils";

const formatDays = (days: number) => `${days.toFixed(days >= 10 ? 0 : 1)} days`;

/**
 * Days sales outstanding at the end of each of the last 12 weeks, as a single
 * ink line. Weeks with nothing billed in the trailing 90 days have no value;
 * the line breaks there instead of dropping to zero.
 */
export function DsoChart({ points }: { points: DsoPoint[] }) {
  const values = points.map((p) => p.dso).filter((v): v is number => v !== null);
  const max = niceMax(Math.max(0, ...values));
  const n = points.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v / max) * 100;

  // Split into runs of consecutive non-null points.
  const runs: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.dso === null) {
      if (current.length) runs.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length ? "L" : "M"}${x(i).toFixed(2)},${y(p.dso).toFixed(2)}`);
  });
  if (current.length) runs.push(current.join(" "));

  const lastIndex = points.findLastIndex((p) => p.dso !== null);
  const latest = lastIndex >= 0 ? points[lastIndex].dso : null;

  return (
    <ChartFrame
      id="dso-trend"
      title="DSO trend"
      description={
        latest !== null
          ? `Days sales outstanding, last 12 weeks. Latest: ${formatDays(latest)}. Lower is better.`
          : "Days sales outstanding, last 12 weeks. Lower is better."
      }
      yTicks={["0", String(max / 2), String(max)]}
      weeks={points.map((p) => p.weekStart)}
      emptyMessage={values.length === 0 ? "No invoices issued in the last 90 days." : undefined}
      table={{
        columns: ["Week", "DSO"],
        rows: points.map((p) => [weekLabelLong(p.weekStart), p.dso === null ? "No data" : formatDays(p.dso)]),
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        {runs.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {points.map((p, i) =>
        p.dso === null ? null : (
          <span
            key={p.weekStart}
            title={`${weekLabelLong(p.weekStart)}: ${formatDays(p.dso)}`}
            className="group absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: `${x(i)}%`, top: `${y(p.dso)}%` }}
          >
            <span
              className={
                i === lastIndex
                  ? "size-2.5 rounded-full bg-chart-1 ring-2 ring-card"
                  : "size-1.5 rounded-full bg-chart-1 ring-2 ring-card transition-transform group-hover:scale-150"
              }
            />
          </span>
        ),
      )}
      {latest !== null ? (
        <span
          className="absolute -translate-x-full -translate-y-full pr-2 pb-1 text-xs font-medium tabular text-foreground"
          style={{ left: `${x(lastIndex)}%`, top: `${y(latest)}%` }}
        >
          {formatDays(latest)}
        </span>
      ) : null}
    </ChartFrame>
  );
}
