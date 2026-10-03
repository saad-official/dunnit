import { FauxSwitch, Panel } from "./mock-frame";

export function AutonomyMock() {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-xs">
        <p className="font-medium">Settings · Autonomy</p>
        <span className="rounded-full bg-sand px-2 py-0.5 text-[0.6875rem] font-medium">Pro</span>
      </div>
      <div className="flex items-start justify-between gap-4 px-4 py-3.5">
        <div className="min-w-0 text-xs">
          <p className="text-sm font-medium">Auto-send step-one reminders</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            Only when confidence is <span className="tabular">0.80</span> or higher, inside your send window.
          </p>
        </div>
        <span className="flex items-center gap-2 pt-0.5 text-xs text-muted-foreground">
          <FauxSwitch />
          On
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-border px-4 py-3 text-xs">
        <dt className="text-muted-foreground">Steps 2 to 4</dt>
        <dd className="text-right font-medium">Wait for approval</dd>
        <dt className="text-muted-foreground">Send window</dt>
        <dd className="tabular text-right font-medium">Weekdays 08:00–18:00</dd>
      </dl>
    </Panel>
  );
}
