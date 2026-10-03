import { CornerDownRight, Pause } from "lucide-react";
import { Panel } from "./mock-frame";

export function ReplyMock() {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-xs">
        <p className="shrink-0 font-medium">
          Reply to <span className="tabular">#1042</span>
        </p>
        <p className="truncate text-muted-foreground">priya@harborlane.example</p>
      </div>
      <div className="space-y-3 px-4 py-3.5">
        <blockquote className="border-l-2 border-foreground/20 pl-3 text-sm leading-relaxed text-foreground/85">
          Hi Sam, sorry this slipped through. We&rsquo;ll pay on the 15th. Priya
        </blockquote>
        <div className="flex flex-wrap items-center gap-2">
          <CornerDownRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <span className="inline-flex h-6 items-center rounded-full bg-amber px-2.5 text-xs font-medium text-amber-foreground">
            Promise to pay ·&nbsp;<span className="tabular">Oct 15</span>
          </span>
          <span className="text-xs text-muted-foreground">
            confidence <span className="tabular font-medium text-foreground">0.93</span>
          </span>
        </div>
      </div>
      <p className="flex items-start gap-2 border-t border-border bg-muted/40 px-4 py-2.5 text-xs">
        <Pause aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span>
          <span className="font-medium">
            Cadence paused until <span className="tabular">Oct 16</span>
          </span>
          <span className="text-muted-foreground">, then a gentle check-in if still unpaid.</span>
        </span>
      </p>
    </Panel>
  );
}
