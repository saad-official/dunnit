import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Cadence as CadenceRow } from "@/lib/db/types";
import { DEFAULT_SEND_WINDOW, MIN_GAP_DAYS } from "@/lib/domain/cadence";
import { cn } from "@/lib/utils";
import {
  describeCadence,
  stopReasonLabel,
  TONE_LABELS,
  type CadencePlanView,
  type LadderStep,
} from "./cadence";
import { formatDateTime, formatDay } from "./format";

const CADENCE_STATUS_LABEL: Record<CadenceRow["status"], string> = {
  active: "Active",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
};

function offsetLabel(step: LadderStep): string | null {
  if (step.dayOffset === null) return null;
  return `due + ${step.dayOffset} ${step.dayOffset === 1 ? "day" : "days"}`;
}

function StepMarker({ state }: { state: LadderStep["state"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
        state === "sent" && "bg-moss text-moss-foreground",
        state === "next" && "bg-amber text-amber-foreground ring-4 ring-amber/25",
        state === "planned" && "bg-card ring-1 ring-foreground/25",
        (state === "skipped" || state === "blocked") && "border border-dashed border-foreground/25 bg-muted",
      )}
    >
      {state === "sent" ? <Check className="size-3.5" /> : null}
    </span>
  );
}

function StepWhen({ step, timeZone, now }: { step: LadderStep; timeZone: string; now: Date }) {
  if (step.state === "skipped" || !step.at) {
    return <p className="text-xs text-muted-foreground">{step.note ?? "Skipped"}</p>;
  }
  switch (step.state) {
    case "sent":
      return <p className="text-xs text-moss">Sent {formatDay(step.at, timeZone, now)}</p>;
    case "next":
      return (
        <p className="text-xs font-medium text-amber-foreground dark:text-amber">
          Next · {formatDateTime(step.at, timeZone)}
        </p>
      );
    case "planned":
      return <p className="text-xs text-muted-foreground">Planned {formatDay(step.at, timeZone, now)}</p>;
    case "blocked":
      return <p className="text-xs text-muted-foreground">Would be {formatDay(step.at, timeZone, now)}</p>;
  }
}

export function CadencePanel({
  plan,
  cadence,
  riskScore,
  timeZone,
  now,
}: {
  plan: CadencePlanView;
  cadence: CadenceRow | null;
  riskScore: number;
  timeZone: string;
  now: Date;
}) {
  const state = describeCadence(cadence, timeZone, now);
  const window = DEFAULT_SEND_WINDOW;
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <section aria-labelledby="cadence-heading" className="rounded-xl bg-card p-4 shadow-card ring-1 ring-foreground/10 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="cadence-heading" className="font-display text-xl">
            Cadence
          </h2>
          <p
            className={cn(
              "mt-1 text-sm",
              state.tone === "attention" && "text-amber-foreground dark:text-amber",
              state.tone === "muted" && "text-muted-foreground",
            )}
          >
            {state.label}
          </p>
        </div>
        {cadence ? (
          <Badge
            variant="secondary"
            className={cn(
              cadence.status === "paused" && "bg-accent text-amber-foreground dark:text-amber",
              (cadence.status === "stopped" || cadence.status === "completed") && "bg-muted text-muted-foreground",
            )}
          >
            {CADENCE_STATUS_LABEL[cadence.status]}
          </Badge>
        ) : null}
      </div>

      {plan.stopReason ? (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {stopReasonLabel(plan.stopReason)}.{" "}
          {plan.stopReason === "paid" || plan.stopReason === "written_off"
            ? "Chasing has stopped for good."
            : "No reminders will go out; dates below show the plan if chasing resumed."}
        </p>
      ) : cadence?.status === "paused" && !cadence.paused_until ? (
        <p className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm text-amber-foreground">
          Waiting on you before the next step. Handle the reply in the Inbox, then resume.
        </p>
      ) : null}

      <ol className="relative mt-4 grid gap-4 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-px before:bg-border">
        {plan.steps.map((step) => (
          <li key={step.step} className="flex gap-3">
            <StepMarker state={step.state} />
            <div className={cn("min-w-0 flex-1", (step.state === "skipped" || step.state === "blocked") && "opacity-70")}>
              <p className="text-sm font-medium">
                Step {step.step} · {TONE_LABELS[step.tone]}
                {offsetLabel(step) ? (
                  <span className="font-normal text-muted-foreground"> · {offsetLabel(step)}</span>
                ) : null}
              </p>
              <StepWhen step={step} timeZone={timeZone} now={now} />
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        Weekdays {pad(window.startHour)}–{pad(window.endHour)} ({timeZone}), at least {MIN_GAP_DAYS} days apart.
        Risk score {riskScore} tunes the ladder.
      </p>
    </section>
  );
}
