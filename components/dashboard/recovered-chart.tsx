import type { RecoveredPoint } from "@/lib/domain/metrics";
import { formatCents } from "@/lib/domain/money";
import { ChartFrame } from "./chart-frame";
import { compactMoney, niceMax, weekLabelLong } from "./chart-utils";

/** Money paid after at least one Dunnit touch, per week, as moss bars. */
export function RecoveredChart({ points, currency }: { points: RecoveredPoint[]; currency: string }) {
  const total = points.reduce((sum, p) => sum + p.cents, 0);
  const max = niceMax(Math.max(0, ...points.map((p) => p.cents)));

  return (
    <ChartFrame
      id="recovered-per-week"
      title="Recovered per week"
      description={`Paid after a Dunnit touch. ${formatCents(total, currency)} over the last 12 weeks.`}
      yTicks={["0", compactMoney(max / 2, currency), compactMoney(max, currency)]}
      weeks={points.map((p) => p.weekStart)}
      emptyMessage={total === 0 ? "Nothing recovered after a touch in the last 12 weeks yet." : undefined}
      table={{
        columns: ["Week", "Recovered"],
        rows: points.map((p) => [weekLabelLong(p.weekStart), formatCents(p.cents, currency)]),
      }}
    >
      <div
        className="absolute inset-0 grid items-end"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((p) => (
          <div
            key={p.weekStart}
            title={`${weekLabelLong(p.weekStart)}: ${formatCents(p.cents, currency)}`}
            className="group flex h-full items-end justify-center px-[3px] sm:px-1.5"
          >
            {p.cents > 0 ? (
              <div
                className="w-full max-w-8 rounded-t-[4px] bg-moss transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max(1.5, (p.cents / max) * 100)}%` }}
              />
            ) : null}
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}
