import { cn } from "@/lib/utils";
import { percent } from "./format";

/**
 * Confidence as a thin bar plus a percentage. Amber at or above the
 * auto-approve threshold (80%), quiet ink below it.
 */
export function ConfidenceMeter({
  value,
  threshold = 0.8,
  label = "Confidence",
  className,
}: {
  value: number;
  threshold?: number;
  label?: string;
  className?: string;
}) {
  const pct = percent(value);
  const high = value >= threshold;
  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        {label}
        <span className="tabular text-sm font-semibold text-foreground">{pct}%</span>
      </p>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", high ? "bg-amber" : "bg-foreground/35")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
