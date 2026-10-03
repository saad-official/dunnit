import Link from "next/link";
import { Bot, ChevronRight, Mail, MessageSquareReply, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AgentEvent, Reply, ReplyIntent, Touch, TouchStatus } from "@/lib/db/types";
import { ReplyClassificationSchema } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { TONE_LABELS } from "./cadence";
import { formatDateTime } from "./format";

type TouchItem = Pick<
  Touch,
  | "id"
  | "step"
  | "tone"
  | "subject"
  | "body"
  | "status"
  | "confidence"
  | "rationale"
  | "sent_at"
  | "created_at"
  | "reject_reason"
>;
type ReplyItem = Pick<
  Reply,
  "id" | "from_email" | "raw_text" | "received_at" | "classification" | "intent" | "handled" | "simulated"
>;
type EventItem = Pick<AgentEvent, "id" | "actor" | "type" | "model" | "prompt_version" | "created_at" | "latency_ms">;

type Entry =
  | { kind: "touch"; at: string; item: TouchItem }
  | { kind: "reply"; at: string; item: ReplyItem }
  | { kind: "event"; at: string; item: EventItem };

const TOUCH_STATUS: Record<TouchStatus, { label: string; className: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Awaiting approval", className: "bg-amber text-amber-foreground", variant: "default" },
  approved: { label: "Approved", className: "", variant: "secondary" },
  snoozed: { label: "Snoozed", className: "bg-muted text-muted-foreground", variant: "secondary" },
  rejected: { label: "Rejected", className: "bg-muted text-muted-foreground", variant: "secondary" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground", variant: "secondary" },
  sent: { label: "Sent", className: "", variant: "default" },
  failed: { label: "Failed", className: "", variant: "destructive" },
};

const INTENT: Record<ReplyIntent, { label: string; className: string }> = {
  paid: { label: "Says paid", className: "bg-moss text-moss-foreground" },
  promise_to_pay: { label: "Promise to pay", className: "bg-amber text-amber-foreground" },
  dispute: { label: "Dispute", className: "bg-brick text-brick-foreground" },
  question: { label: "Question", className: "bg-secondary text-secondary-foreground" },
  wrong_contact: { label: "Wrong contact", className: "border-amber/60 bg-accent text-amber-foreground dark:text-amber" },
  out_of_office: { label: "Out of office", className: "bg-muted text-muted-foreground" },
  unsubscribe: { label: "Unsubscribe", className: "bg-muted text-muted-foreground" },
  other: { label: "Other", className: "bg-muted text-muted-foreground" },
};

function Marker({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-card ring-1 ring-foreground/10",
        className,
      )}
      aria-hidden
    >
      <Icon className="size-3.5" />
    </span>
  );
}

function Expandable({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group mt-2 rounded-lg border bg-background/60 open:bg-background">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        {summary}
      </summary>
      <div className="border-t px-3 py-3">{children}</div>
    </details>
  );
}

function TouchEntry({ item }: { item: TouchItem }) {
  const status = TOUCH_STATUS[item.status];
  const confidence = Math.round(Number(item.confidence) * 100);
  const stepLabel = item.step > 0 ? `Step ${item.step} · ${TONE_LABELS[item.tone]}` : TONE_LABELS[item.tone];
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={status.variant} className={cn(status.className && "border-transparent", status.className)}>
          {status.label}
        </Badge>
        <span className="text-xs text-muted-foreground">{stepLabel}</span>
        <span className="tabular text-xs text-muted-foreground">· {confidence}% confidence</span>
      </div>
      <p className="mt-1.5 font-medium break-words">{item.subject}</p>
      {item.status === "rejected" && item.reject_reason ? (
        <p className="mt-1 text-sm text-muted-foreground">Rejected: {item.reject_reason}</p>
      ) : null}
      {item.status === "draft" ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Waiting in the{" "}
          <Link href="/queue" className="underline underline-offset-3 hover:text-foreground">
            approval queue
          </Link>
          .
        </p>
      ) : null}
      {item.status === "sent" ? (
        <Expandable summary="Show message">
          <p className="text-sm whitespace-pre-wrap break-words">{item.body}</p>
          {item.rationale ? (
            <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">Why this message: {item.rationale}</p>
          ) : null}
        </Expandable>
      ) : null}
    </div>
  );
}

function ReplyEntry({ item }: { item: ReplyItem }) {
  const parsed = ReplyClassificationSchema.safeParse(item.classification);
  const intent = item.intent ?? (parsed.success ? parsed.data.intent : null);
  const meta = intent ? INTENT[intent] : null;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium">Reply from {item.from_email}</span>
        {meta ? <Badge className={cn("border-transparent", meta.className)}>{meta.label}</Badge> : null}
        {item.simulated ? (
          <Badge variant="outline" className="text-muted-foreground">
            Simulated
          </Badge>
        ) : null}
        {!item.handled ? (
          <Link href="/inbox" className="text-xs text-amber-foreground underline underline-offset-3 dark:text-amber">
            Needs handling
          </Link>
        ) : null}
      </div>
      {parsed.success ? (
        <p className="mt-1.5 text-sm">
          {parsed.data.summary}
          {parsed.data.promiseDate ? (
            <span className="text-muted-foreground"> · promised for {parsed.data.promiseDate}</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">Not classified yet.</p>
      )}
      <Expandable summary="Show reply">
        <p className="text-sm whitespace-pre-wrap break-words">{item.raw_text}</p>
      </Expandable>
    </div>
  );
}

function EventEntry({ item }: { item: EventItem }) {
  const meta = [item.model, item.prompt_version, item.latency_ms !== null ? `${item.latency_ms} ms` : null].filter(Boolean);
  return (
    <div className="min-w-0 flex-1 text-sm">
      <span className="font-mono text-xs break-all">{item.type}</span>
      <span className="text-xs text-muted-foreground"> · {item.actor}</span>
      {meta.length > 0 ? <p className="mt-0.5 font-mono text-xs break-all text-muted-foreground">{meta.join(" · ")}</p> : null}
    </div>
  );
}

/**
 * Touches, replies and agent events for one invoice in a single list, newest
 * first. Sent messages and replies expand to show their text (native
 * <details>, so it works without client JavaScript).
 */
export function InvoiceTimeline({
  touches,
  replies,
  events,
  timeZone,
}: {
  touches: TouchItem[];
  replies: ReplyItem[];
  events: EventItem[];
  timeZone: string;
}) {
  const entries: Entry[] = [
    ...touches.map((item): Entry => ({ kind: "touch", at: item.sent_at ?? item.created_at, item })),
    ...replies.map((item): Entry => ({ kind: "reply", at: item.received_at, item })),
    ...events.map((item): Entry => ({ kind: "event", at: item.created_at, item })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing has happened on this invoice yet.</p>;
  }

  return (
    <ol className="relative grid gap-5 before:absolute before:top-2 before:bottom-2 before:left-3.5 before:w-px before:bg-border">
      {entries.map((entry) => (
        <li key={`${entry.kind}-${entry.item.id}`} className="flex gap-3">
          {entry.kind === "touch" ? (
            <Marker icon={Mail} className={entry.item.status === "sent" ? "text-foreground" : "text-muted-foreground"} />
          ) : entry.kind === "reply" ? (
            <Marker icon={MessageSquareReply} className="text-amber-foreground dark:text-amber" />
          ) : (
            <Marker icon={Bot} className="size-7 text-muted-foreground" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
            <time dateTime={entry.at} className="tabular text-xs text-muted-foreground">
              {formatDateTime(entry.at, timeZone)}
            </time>
            {entry.kind === "touch" ? (
              <TouchEntry item={entry.item} />
            ) : entry.kind === "reply" ? (
              <ReplyEntry item={entry.item} />
            ) : (
              <EventEntry item={entry.item} />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
