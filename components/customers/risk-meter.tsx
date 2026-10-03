import { HIGH_RISK_THRESHOLD, LOW_RISK_THRESHOLD } from "@/lib/domain/cadence";
import { cn } from "@/lib/utils";

export function riskBand(score: number): "low" | "medium" | "high" {
  if (score >= HIGH_RISK_THRESHOLD) return "high";
  if (score <= LOW_RISK_THRESHOLD) return "low";
  return "medium";
}

const BAND_LABEL = { low: "Low risk", medium: "Medium risk", high: "High risk" } as const;

/** Small 0-100 bar. Moss for reliable payers, amber for high risk (attention, not alarm). */
export function RiskMeter({ score, className }: { score: number; className?: string }) {
  const band = riskBand(score);
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={`Risk score ${clamped} of 100, ${BAND_LABEL[band].toLowerCase()}`}
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full",
            band === "low" && "bg-moss",
            band === "medium" && "bg-chart-4",
            band === "high" && "bg-amber",
          )}
          style={{ width: `${Math.max(clamped, 4)}%` }}
        />
      </div>
      <span className="tabular w-6 text-xs text-muted-foreground">{clamped}</span>
    </div>
  );
}
