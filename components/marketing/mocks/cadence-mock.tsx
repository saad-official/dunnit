import { cn } from "@/lib/utils";
import { Panel } from "./mock-frame";

type State = "sent" | "waiting" | "planned";

const steps: { offset: string; tone: string; date: string; state: State }[] = [
  { offset: "+1", tone: "Friendly", date: "Thu Oct 1", state: "sent" },
  { offset: "+7", tone: "Firm", date: "Wed Oct 7", state: "waiting" },
  { offset: "+14", tone: "Formal", date: "Wed Oct 14", state: "planned" },
  { offset: "+30", tone: "Final", date: "Fri Oct 30", state: "planned" },
];

const stateLabel: Record<State, string> = {
  sent: "Sent",
  waiting: "Awaiting you",
  planned: "Planned",
};

export function CadenceMock() {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-xs">
        <p className="font-medium">
          Cadence for <span className="tabular">#1042</span>
        </p>
        <p className="text-muted-foreground">
          Due <span className="tabular">Wed Sep 30</span>
        </p>
      </div>
      <ol className="px-4 py-2">
        {steps.map((s, i) => (
          <li
            key={s.offset}
            className="relative grid grid-cols-[0.875rem_3.5rem_minmax(0,1fr)_auto] items-center gap-2 py-2 text-xs"
          >
            {i < steps.length - 1 ? (
              <span aria-hidden="true" className="absolute top-1/2 left-[0.40625rem] h-full w-px bg-border" />
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "relative mx-auto block size-2.5",
                s.state === "sent" && "rounded-full bg-foreground",
                s.state === "waiting" && "bg-amber",
                s.state === "planned" && "rounded-full border border-foreground/40 bg-card",
              )}
            />
            <span className="tabular text-muted-foreground">Day {s.offset}</span>
            <span className="min-w-0 truncate">
              <span className="font-medium">{s.tone}</span>
              <span className="tabular text-muted-foreground"> · {s.date}</span>
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.6875rem] whitespace-nowrap",
                s.state === "waiting" ? "bg-amber font-medium text-amber-foreground" : "text-muted-foreground",
              )}
            >
              {stateLabel[s.state]}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
