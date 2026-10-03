"use client";

import { useState } from "react";
import { FieldShell } from "@/components/invoices/form-parts";
import { Input } from "@/components/ui/input";
import { HIGH_RISK_THRESHOLD, LOW_RISK_THRESHOLD } from "@/lib/domain/cadence";

function describe(score: number): string {
  if (score >= HIGH_RISK_THRESHOLD) return "High risk: skips the friendly nudge and starts firm the day after due.";
  if (score <= LOW_RISK_THRESHOLD) return "Reliable payer: the first nudge waits until 3 days after due.";
  return "Standard ladder: nudges 1, 7, 14 and 30 days after due.";
}

/** Slider plus number input, kept in sync; submits as `name` (defaults to id). */
export function RiskScoreField({
  id,
  name,
  defaultValue,
  error,
}: {
  id: string;
  name?: string;
  defaultValue: number;
  error?: string;
}) {
  const [score, setScore] = useState(defaultValue);
  const set = (raw: string) => {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n)) setScore(Math.max(0, Math.min(100, n)));
  };

  return (
    <FieldShell id={id} label="Risk score" error={error} hint={describe(score)}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={score}
          onChange={(e) => set(e.target.value)}
          aria-label="Risk score slider"
          className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--ink)] dark:accent-[var(--amber)]"
        />
        <Input
          id={id}
          name={name ?? id}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={score}
          onChange={(e) => set(e.target.value)}
          className="tabular w-20"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
        />
      </div>
    </FieldShell>
  );
}
