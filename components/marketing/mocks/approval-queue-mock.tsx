import { Badge } from "@/components/ui/badge";
import { FauxButton, MockFrame, Panel, PanelHeader } from "./mock-frame";

const waiting = [
  { number: "1047", customer: "Kettle & Co.", step: "Friendly", amount: "$780.00", confidence: "0.91" },
  { number: "1051", customer: "Northwind Joinery", step: "Formal", amount: "$4,120.00", confidence: "0.72" },
];

/** The approval queue as it appears in the app: one draft open, two waiting. */
export function ApprovalQueueMock() {
  return (
    <MockFrame caption="Fig. 1. A drafted reminder waiting in the approval queue. Synthetic data.">
      <Panel>
        <PanelHeader title="Approval queue" meta={<span className="tabular">3 waiting</span>} />

        <article aria-label="Draft reminder for invoice 1042" className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Invoice <span className="tabular">#1042</span> · Harbor Lane Studio
              </p>
              <p className="money mt-0.5 text-2xl font-semibold">$2,350.00</p>
            </div>
            <Badge variant="outline" className="h-6 border-border px-2.5">
              Step 2 of 4 · Firm
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Due <span className="tabular">Sep 30</span> · <span className="tabular">7</span> days overdue · sends
            Wed <span className="tabular">Oct 7, 09:00</span>
          </p>

          <div className="rounded-lg border border-border bg-background p-3.5 text-sm leading-relaxed">
            <p className="font-medium">
              Subject: Invoice <span className="tabular">#1042</span>, a quick follow-up
            </p>
            <div className="mt-2.5 space-y-2 text-foreground/80">
              <p>Hi Priya,</p>
              <p>
                Invoice <span className="tabular">#1042</span> for <span className="money">$2,350.00</span> was due
                on September 30 and is now a week overdue. Could you let me know when we can expect payment? If
                something on the invoice looks wrong, reply here and I&rsquo;ll sort it out.
              </p>
              <p>
                Thanks,
                <br />
                Sam, Ortiz &amp; Reyes Design
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,9rem)_1fr] sm:items-start">
            <div>
              <p className="flex items-baseline justify-between text-xs text-muted-foreground">
                Confidence <span className="tabular text-sm font-semibold text-foreground">0.86</span>
              </p>
              <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[86%] rounded-full bg-amber" />
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Why: </span>
              No reply to the friendly reminder on Oct 1. Harbor Lane usually pays within 12 days, so the tone
              stays firm but warm and asks for a date.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <FauxButton tone="ink" kbd="A">
              Approve
            </FauxButton>
            <FauxButton kbd="E">Edit</FauxButton>
            <FauxButton tone="ghost" kbd="R">
              Reject
            </FauxButton>
          </div>
        </article>

        <ul aria-label="Other drafts waiting" className="divide-y divide-border border-t border-border bg-muted/40">
          {waiting.map((row) => (
            <li key={row.number} className="flex items-center gap-3 px-4 py-2.5 text-xs sm:px-5">
              <span className="tabular w-11 shrink-0 text-muted-foreground">#{row.number}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{row.customer}</span>
              <span className="hidden text-muted-foreground sm:inline">{row.step}</span>
              <span className="money w-[4.75rem] shrink-0 text-right">{row.amount}</span>
              <span className="tabular w-8 shrink-0 text-right text-muted-foreground">{row.confidence}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </MockFrame>
  );
}
