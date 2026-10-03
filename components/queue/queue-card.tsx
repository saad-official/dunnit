"use client";

import { useId, useState, useTransition } from "react";
import { AlarmClock, Check, ChevronDown, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { approveTouch, rejectTouch, saveAndSendTouch, snoozeTouch } from "@/app/(app)/queue/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QueueItem } from "@/lib/services/queue";
import { cn } from "@/lib/utils";
import { ConfidenceMeter } from "./confidence-meter";
import { formatCalendarDate, overdueLabel, stepToneLabel } from "./format";
import type { ApproveResult } from "./types";

type Mode = "view" | "edit" | "reject";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-1 hidden rounded border border-current/25 px-1 font-sans text-[0.65rem] leading-4 opacity-70 sm:inline-block">
      {children}
    </kbd>
  );
}

function toastApprove(result: ApproveResult) {
  if (!result.ok) {
    toast.error(result.error, result.details?.length ? { description: result.details.join(" ") } : undefined);
    return;
  }
  const { feedback } = result;
  if (feedback.sent) toast.success(feedback.title, { description: feedback.description });
  else toast.warning(feedback.title, { description: feedback.description });
}

export function QueueCard({ item }: { item: QueueItem }) {
  const [mode, setMode] = useState<Mode>("view");
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<{ message: string; details?: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const headingId = useId();
  const fieldId = useId();

  const overdue = item.daysOverdue > 0;

  function approve() {
    startTransition(async () => {
      toastApprove(await approveTouch(item.id));
    });
  }

  function saveAndSend(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await saveAndSendTouch({ touchId: item.id, subject, body });
      if (!result.ok) {
        setFormError({ message: result.error, details: result.details });
        return;
      }
      toastApprove(result);
    });
  }

  function reject(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await rejectTouch({ touchId: item.id, reason });
      if (!result.ok) {
        setFormError({ message: result.error });
        return;
      }
      toast.success(result.message);
    });
  }

  function snooze(days: 1 | 3) {
    startTransition(async () => {
      const result = await snoozeTouch({ touchId: item.id, days });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  function switchMode(next: Mode) {
    setFormError(null);
    setMode(next);
    if (next === "edit") {
      setSubject(item.subject);
      setBody(item.body);
    }
  }

  function cancelOnEscape(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      switchMode("view");
    }
  }

  return (
    <article
      data-queue-card={item.id}
      tabIndex={-1}
      aria-labelledby={headingId}
      aria-busy={pending || undefined}
      className={cn(
        "scroll-mt-20 rounded-xl bg-card shadow-card ring-1 ring-foreground/10 transition-shadow outline-none",
        "focus-within:ring-foreground/20 focus:ring-2 focus:ring-amber",
        pending && "opacity-70",
      )}
    >
      <div className="space-y-4 p-4 sm:p-5">
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Invoice <span className="tabular">#{item.invoice.number}</span>
              {item.customer.company ? <> · {item.customer.company}</> : null}
            </p>
            <h2 id={headingId} className="mt-0.5 font-sans text-base font-semibold tracking-normal">
              {item.customer.name}{" "}
              <span className="font-normal text-muted-foreground break-all">&lt;{item.customer.email}&gt;</span>
            </h2>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <p className="money text-xl font-semibold leading-none">{item.invoice.amountFormatted}</p>
            <Badge variant="outline" className="h-6 px-2.5">
              {stepToneLabel(item.step, item.tone)}
            </Badge>
          </div>
        </header>

        <p className="text-xs text-muted-foreground">
          Due <span className="tabular">{formatCalendarDate(item.invoice.dueAt)}</span> ·{" "}
          <span className={cn("tabular", overdue && "font-medium text-foreground")}>
            {overdueLabel(item.daysOverdue)}
          </span>
          {item.status === "snoozed" ? <> · back from snooze</> : null}
        </p>

        {mode === "edit" ? (
          <form onSubmit={saveAndSend} onKeyDown={cancelOnEscape} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-subject`}>Subject</Label>
              <Input
                id={`${fieldId}-subject`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-body`}>Body</Label>
              <Textarea
                id={`${fieldId}-body`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                maxLength={1800}
                required
                autoFocus
                disabled={pending}
                className="min-h-48 leading-relaxed"
              />
            </div>
            <FormError error={formError} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={pending}
                className="bg-amber text-amber-foreground hover:bg-amber/85"
              >
                <Check aria-hidden />
                {pending ? "Sending" : "Save & send"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => switchMode("view")} disabled={pending}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="rounded-lg border border-border bg-background p-3.5 text-sm leading-relaxed">
            <p className="font-medium">
              <span className="text-muted-foreground">Subject: </span>
              {item.subject}
            </p>
            <p className="mt-2.5 whitespace-pre-wrap break-words text-foreground/85">{item.body}</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_1fr] sm:items-start">
          <ConfidenceMeter value={item.confidence} />
          {item.rationale ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Why: </span>
              {item.rationale}
            </p>
          ) : null}
        </div>

        {mode === "reject" ? (
          <form onSubmit={reject} onKeyDown={cancelOnEscape} className="space-y-2 border-t border-border pt-4">
            <Label htmlFor={`${fieldId}-reason`}>Why reject this draft?</Label>
            <Textarea
              id={`${fieldId}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Too formal for this client; they always pay after one nudge."
              maxLength={500}
              rows={3}
              required
              autoFocus
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              The agent reads recent reasons before writing the next draft.
            </p>
            <FormError error={formError} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="outline" disabled={pending}>
                <X aria-hidden />
                {pending ? "Rejecting" : "Reject draft"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => switchMode("view")} disabled={pending}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      {mode === "view" ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-5">
          <Button
            data-shortcut="a"
            onClick={approve}
            disabled={pending}
            className="bg-amber text-amber-foreground hover:bg-amber/85"
          >
            <Check aria-hidden />
            {pending ? "Sending" : "Approve & send"}
            <Kbd>A</Kbd>
          </Button>
          <Button data-shortcut="e" variant="outline" onClick={() => switchMode("edit")} disabled={pending}>
            <Pencil aria-hidden />
            Edit
            <Kbd>E</Kbd>
          </Button>
          <Button data-shortcut="r" variant="ghost" onClick={() => switchMode("reject")} disabled={pending}>
            <X aria-hidden />
            Reject
            <Kbd>R</Kbd>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" disabled={pending} className="sm:ml-auto">
                <AlarmClock aria-hidden />
                Snooze
                <ChevronDown aria-hidden className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => snooze(1)}>For 1 day</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => snooze(3)}>For 3 days</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </footer>
      ) : null}
    </article>
  );
}

function FormError({ error }: { error: { message: string; details?: string[] } | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm">
      <p className="font-medium">{error.message}</p>
      {error.details?.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {error.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
