import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfidenceMeter } from "@/components/queue/confidence-meter";
import { formatDateTime } from "@/components/queue/format";
import type { InboxReply } from "@/lib/services/inbox";
import { cn } from "@/lib/utils";
import { IntentBadge } from "./intent-badge";
import { MarkHandledButton, TaskActions } from "./reply-actions";

const INVOICE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  pending_verification: "Pending verification",
  paid: "Paid",
  disputed: "Disputed",
  written_off: "Written off",
  paused: "Paused",
};

/** Task details repeat the summary and suggestion shown above; keep only the extra lines. */
function extraDetail(detail: string, c: InboxReply["classification"]): string {
  if (!c) return detail;
  const shown = new Set([c.summary.trim(), `Suggested: ${c.suggestedAction.trim()}`]);
  return detail
    .split("\n")
    .filter((line) => !shown.has(line.trim()))
    .join("\n")
    .trim();
}

export function ReplyCard({ reply, timezone }: { reply: InboxReply; timezone: string }) {
  const c = reply.classification;
  const isQuestion = c?.intent === "question";
  const invoicePaid = reply.invoice.status === "paid";

  return (
    <article
      aria-label={`Reply from ${reply.customer.name} on invoice ${reply.invoice.number}`}
      className={cn(
        "rounded-xl bg-card shadow-card ring-1 ring-foreground/10",
        reply.handled && "bg-card/70 shadow-none",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            Reply to <span className="tabular">#{reply.invoice.number}</span> ·{" "}
            <span className="money">{reply.invoice.amountFormatted}</span> ·{" "}
            {INVOICE_STATUS_LABELS[reply.invoice.status] ?? reply.invoice.status}
          </p>
          <h2 className="mt-0.5 font-sans text-base font-semibold tracking-normal">
            {reply.customer.name}
            {reply.customer.company ? (
              <span className="font-normal text-muted-foreground"> · {reply.customer.company}</span>
            ) : null}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {reply.fromEmail} · received{" "}
            <time dateTime={reply.receivedAt} className="tabular">
              {formatDateTime(reply.receivedAt, timezone)}
            </time>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {reply.simulated ? (
            <Badge variant="outline" className="h-6 px-2.5">
              Simulated
            </Badge>
          ) : null}
          {reply.handled ? (
            <Badge variant="outline" className="h-6 px-2.5 text-muted-foreground">
              Handled
            </Badge>
          ) : null}
          <IntentBadge intent={c?.intent ?? null} promiseDate={c?.promiseDate} />
        </div>
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {c ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_minmax(0,10rem)] sm:items-start">
            <div className="space-y-1.5 text-sm leading-relaxed">
              <p>{c.summary}</p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Suggested: </span>
                {c.suggestedAction}
              </p>
            </div>
            <ConfidenceMeter value={c.confidence} threshold={0.6} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This reply could not be classified automatically, so chasing is paused until you read it.
          </p>
        )}

        <details className="group rounded-lg border border-border bg-background">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show original reply</span>
            <span className="hidden group-open:inline">Hide original reply</span>
          </summary>
          <blockquote className="border-t border-border px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/85">
            {reply.rawText}
          </blockquote>
        </details>

        {reply.tasks.length > 0 ? (
          <section aria-label="Tasks for you">
            <h3 className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
              For you
            </h3>
            <ul className="mt-2 space-y-3">
              {reply.tasks.map((task, i) => {
                const detail = extraDetail(task.detail, c);
                return (
                  <li key={`${task.type}-${i}`} className="flex gap-2.5">
                    {task.done ? (
                      <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-moss" />
                    ) : (
                      <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <p className={cn("text-sm font-medium", task.done && "text-muted-foreground line-through")}>
                          <span className="sr-only">{task.done ? "Done: " : "To do: "}</span>
                          {task.title}
                        </p>
                        {detail ? (
                          <p className="mt-0.5 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
                            {detail}
                          </p>
                        ) : null}
                        {task.type === "fix_contact" && !task.done ? (
                          <Link
                            href="/customers"
                            className="mt-1 inline-block text-xs font-medium underline underline-offset-4"
                          >
                            Update the customer
                          </Link>
                        ) : null}
                      </div>
                      <TaskActions
                        replyId={reply.id}
                        taskType={task.type}
                        isQuestion={isQuestion}
                        handled={reply.handled}
                        invoicePaid={invoicePaid}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : !reply.handled ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">Nothing for you to do. Dunnit already adjusted the cadence.</p>
            <MarkHandledButton replyId={reply.id} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
