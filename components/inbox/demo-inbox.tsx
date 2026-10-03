"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, Wand2 } from "lucide-react";
import { simulateDemoReply, submitDemoReply } from "@/app/(app)/inbox/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfidenceMeter } from "@/components/queue/confidence-meter";
import type { DemoInvoiceOption } from "@/lib/services/inbox";
import type { ReplyIntent } from "@/lib/domain/types";
import { INTENT_LABELS, IntentBadge } from "./intent-badge";
import type { DemoReplyResult } from "./types";

const ANY_INTENT = "any";
const INTENT_OPTIONS = Object.entries(INTENT_LABELS) as Array<[ReplyIntent, string]>;

/**
 * Demo inbox: exercise the reply reader without a mailbox. Pasted and
 * simulated replies are both stored with simulated = true and labelled.
 */
export function DemoInbox({ invoices }: { invoices: DemoInvoiceOption[] }) {
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.invoiceId ?? "");
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<string>(ANY_INTENT);
  const [result, setResult] = useState<DemoReplyResult | null>(null);
  const [busy, setBusy] = useState<"paste" | "simulate" | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  const selected = invoices.find((i) => i.invoiceId === invoiceId);

  function paste(event: React.FormEvent) {
    event.preventDefault();
    setBusy("paste");
    startTransition(async () => {
      const res = await submitDemoReply({ invoiceId, rawText: text });
      setResult(res);
      if (res.ok) setText("");
      setBusy(null);
    });
  }

  function simulate() {
    setBusy("simulate");
    startTransition(async () => {
      const res = await simulateDemoReply({ invoiceId, intent: intent === ANY_INTENT ? null : intent });
      setResult(res);
      setBusy(null);
    });
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="font-display text-lg">Demo inbox</CardTitle>
        <CardDescription>
          Try the reply reader without a mailbox. Paste what a customer might write, or let Dunnit write a
          plausible reply. Both are labelled Simulated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Demo replies attach to an invoice that has at least one sent reminder.{" "}
            <Link href="/queue" className="font-medium text-foreground underline underline-offset-4">
              Approve a draft in the queue
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-invoice`}>Invoice</Label>
              <Select value={invoiceId} onValueChange={setInvoiceId} disabled={pending}>
                <SelectTrigger id={`${id}-invoice`} className="w-full sm:max-w-md">
                  <SelectValue placeholder="Choose an invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((inv) => (
                    <SelectItem key={inv.invoiceId} value={inv.invoiceId}>
                      <span className="tabular">#{inv.number}</span> · {inv.customerName} ·{" "}
                      <span className="money">{inv.amountFormatted}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected ? (
                <p className="truncate text-xs text-muted-foreground">
                  Replying to &ldquo;{selected.lastSentSubject}&rdquo; from {selected.customerEmail}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,16rem)]">
              <form onSubmit={paste} className="space-y-2">
                <Label htmlFor={`${id}-text`}>Paste a reply</Label>
                <Textarea
                  id={`${id}-text`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Hi, sorry this slipped through. We'll pay on the 15th."
                  rows={3}
                  maxLength={5000}
                  disabled={pending}
                />
                <Button
                  type="submit"
                  disabled={pending || !invoiceId || text.trim().length < 3}
                  className="bg-amber text-amber-foreground hover:bg-amber/85"
                >
                  <Wand2 aria-hidden />
                  {busy === "paste" ? "Reading" : "Read this reply"}
                </Button>
              </form>

              <div className="space-y-2 md:border-l md:border-border md:pl-4">
                <Label htmlFor={`${id}-intent`}>Or simulate one</Label>
                <Select value={intent} onValueChange={setIntent} disabled={pending}>
                  <SelectTrigger id={`${id}-intent`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_INTENT}>Any intent (realistic mix)</SelectItem>
                    {INTENT_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={simulate} disabled={pending || !invoiceId}>
                  <Sparkles aria-hidden />
                  {busy === "simulate" ? "Writing reply" : "Simulate a reply"}
                </Button>
              </div>
            </div>

            <div aria-live="polite">{result ? <DemoResult result={result} /> : null}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DemoResult({ result }: { result: DemoReplyResult }) {
  if (!result.ok) {
    return (
      <div role={result.code === "ai_unavailable" ? undefined : "alert"} className="rounded-lg border border-border bg-muted/60 px-3 py-2.5 text-sm">
        <p className="font-medium">
          {result.code === "ai_unavailable" ? "Simulation needs a model key" : "That didn't work"}
        </p>
        <p className="mt-0.5 text-muted-foreground">{result.error}</p>
      </div>
    );
  }

  const c = result.classification;
  const mismatch = result.intendedIntent && c && result.intendedIntent !== c.intent;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3.5">
      <blockquote className="border-l-2 border-foreground/20 pl-3 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/85">
        {result.text}
      </blockquote>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Read as</span>
        <IntentBadge intent={c?.intent ?? null} promiseDate={c?.promiseDate} />
        {result.intendedIntent ? (
          <span>
            · simulator aimed for {INTENT_LABELS[result.intendedIntent].toLowerCase()}
            {mismatch ? " (a different read)" : ""}
          </span>
        ) : null}
      </div>
      {c ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_minmax(0,10rem)] sm:items-start">
          <div className="space-y-1 text-sm leading-relaxed">
            <p>{c.summary}</p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Suggested: </span>
              {c.suggestedAction}
            </p>
          </div>
          <ConfidenceMeter value={c.confidence} threshold={0.6} />
        </div>
      ) : null}
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
        {result.effects.map((e) => (
          <li key={e}>{e}</li>
        ))}
        {result.tasks.map((t) => (
          <li key={t}>New task: {t}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">It is now in the list below.</p>
    </div>
  );
}
