/**
 * Cadence display logic: a one-line state for lists, and the four-step ladder
 * for the invoice detail page. Pure; the plan comes from lib/domain/cadence.
 */
import { toDomainCustomer, toDomainInvoice, toDomainOrganization } from "@/lib/db/mappers";
import type {
  Cadence as CadenceRow,
  CadenceStatus,
  Customer as CustomerRow,
  Invoice as InvoiceRow,
  Organization as OrganizationRow,
} from "@/lib/db/types";
import {
  HIGH_RISK_THRESHOLD,
  MIN_GAP_DAYS,
  nextSendTime,
  planCadence,
  shouldStop,
  type PlannedStepNumber,
  type StopReason,
} from "@/lib/domain/cadence";
import { MS_PER_DAY } from "@/lib/domain/dates";
import type { Tone } from "@/lib/domain/types";
import { formatDay } from "./format";

const PAUSE_REASON_LABELS: Record<string, string> = {
  promise_to_pay: "promise to pay",
  reply_paid: "customer says paid",
  reply_dispute: "dispute",
  reply_question: "question to answer",
  reply_wrong_contact: "wrong contact",
  reply_needs_review: "reply needs review",
  contact_flagged: "contact flagged",
  invoice_paused: "paused by you",
  disputed: "dispute",
  pending_verification: "payment to confirm",
  do_not_contact: "do not contact",
  paid: "paid",
  written_off: "written off",
};

export function pauseReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "waiting";
  return PAUSE_REASON_LABELS[reason] ?? reason.replaceAll("_", " ");
}

const STOP_REASON_LABELS: Record<StopReason, string> = {
  paid: "Invoice is paid",
  written_off: "Invoice was written off",
  do_not_contact: "Customer is marked do-not-contact",
  contact_flagged: "Customer contact is flagged; fix the email to resume",
  invoice_paused: "Chasing is paused",
  disputed: "Invoice is disputed",
  pending_verification: "Customer says it's paid; confirm the payment",
};

export function stopReasonLabel(reason: StopReason): string {
  return STOP_REASON_LABELS[reason];
}

export type CadenceStateInput = Pick<
  CadenceRow,
  "status" | "step" | "next_run_at" | "paused_until" | "pause_reason"
>;

export type CadenceState = { label: string; tone: "default" | "attention" | "muted" };

/** "Step 2 sent · next Oct 9", "Paused: promise to pay until Oct 16", "Stopped". */
export function describeCadence(
  cadence: CadenceStateInput | null,
  timeZone: string,
  now?: Date,
): CadenceState {
  if (!cadence) return { label: "No cadence", tone: "muted" };
  const day = (iso: string) => formatDay(iso, timeZone, now);
  switch (cadence.status) {
    case "active": {
      if (!cadence.next_run_at) {
        return { label: cadence.step > 0 ? `Step ${cadence.step} sent` : "Scheduled", tone: "default" };
      }
      return cadence.step > 0
        ? { label: `Step ${cadence.step} sent · next ${day(cadence.next_run_at)}`, tone: "default" }
        : { label: `First reminder ${day(cadence.next_run_at)}`, tone: "default" };
    }
    case "paused": {
      const until = cadence.paused_until ? ` until ${day(cadence.paused_until)}` : "";
      return { label: `Paused: ${pauseReasonLabel(cadence.pause_reason)}${until}`, tone: "attention" };
    }
    case "stopped":
      return { label: "Stopped", tone: "muted" };
    case "completed":
      return { label: "All reminders sent", tone: "muted" };
  }
}

export const TONE_LABELS: Record<Tone | "check_in" | "reply", string> = {
  friendly: "Friendly nudge",
  firm: "Firm reminder",
  formal: "Formal notice",
  final: "Final notice",
  check_in: "Promise check-in",
  reply: "Reply",
};

export type LadderStepState = "sent" | "next" | "planned" | "skipped" | "blocked";

export type LadderStep = {
  step: PlannedStepNumber;
  tone: Tone;
  /** Days after the due date the step targets. Null for a step this customer skips. */
  dayOffset: number | null;
  state: LadderStepState;
  /** Sent time for sent steps, scheduled time otherwise; null for skipped steps. */
  at: string | null;
  note?: string;
};

export type CadencePlanView = {
  steps: LadderStep[];
  /** Why chasing cannot continue right now, if anything. */
  stopReason: StopReason | null;
  cadenceStatus: CadenceStatus | null;
};

const LADDER_TONES: Record<PlannedStepNumber, Tone> = { 1: "friendly", 2: "firm", 3: "formal", 4: "final" };

/**
 * The deterministic plan for one invoice (planCadence), reconciled with what
 * actually happened: sent steps show their sent time, the next step uses the
 * cadence row's next_run_at (it may have moved for a pause or an out-of-office
 * reply), and later steps are projected from it with the minimum gap and send
 * window. When chasing is blocked, the dates show what the plan would be.
 */
export function buildCadencePlan(input: {
  org: OrganizationRow;
  invoice: InvoiceRow;
  customer: CustomerRow;
  cadence: CadenceRow | null;
  sentSteps: ReadonlyMap<number, string>;
  now: Date;
}): CadencePlanView {
  const { org, invoice, customer, cadence, sentSteps, now } = input;
  const domainOrg = toDomainOrganization(org);
  const domainInvoice = toDomainInvoice(invoice);
  const domainCustomer = toDomainCustomer(customer);
  const timezone = domainOrg.timezone;

  const stopReason = shouldStop(domainInvoice, domainCustomer);
  // When blocked, plan as if chasing were allowed so the owner still sees the ladder.
  const plan = planCadence(
    stopReason ? { ...domainInvoice, status: "open" } : domainInvoice,
    stopReason ? { ...domainCustomer, doNotContact: false, contactFlag: "none" } : domainCustomer,
    { timezone },
    now,
  );

  const cadenceClosed = cadence?.status === "stopped" || cadence?.status === "completed";
  const blocked = Boolean(stopReason) || cadenceClosed;
  const lastStep = Math.max(cadence?.step ?? 0, ...sentSteps.keys());

  const steps: LadderStep[] = [];
  let previous: Date | null = null;
  let nextAssigned = false;

  for (const n of [1, 2, 3, 4] as const) {
    const rung = plan.find((p) => p.step === n);
    const sentAt = sentSteps.get(n);

    if (sentAt) {
      steps.push({ step: n, tone: LADDER_TONES[n], dayOffset: rung?.dayOffset ?? null, state: "sent", at: sentAt });
      previous = new Date(sentAt);
      continue;
    }
    if (!rung) {
      steps.push({
        step: n,
        tone: LADDER_TONES[n],
        dayOffset: null,
        state: "skipped",
        at: null,
        note:
          customer.risk_score >= HIGH_RISK_THRESHOLD
            ? "Skipped for high-risk customers; the firm reminder comes first."
            : "Not in this plan.",
      });
      continue;
    }
    if (n <= lastStep) {
      steps.push({
        step: n,
        tone: rung.tone,
        dayOffset: rung.dayOffset,
        state: "skipped",
        at: null,
        note: "Passed without a send.",
      });
      continue;
    }

    if (stopReason === "paid" || stopReason === "written_off") {
      steps.push({ step: n, tone: rung.tone, dayOffset: rung.dayOffset, state: "blocked", at: null, note: "Not sent" });
      continue;
    }

    let at = rung.scheduledAt;
    if (!nextAssigned && !blocked && cadence?.next_run_at) {
      at = new Date(cadence.next_run_at);
    } else if (previous) {
      const earliest = previous.getTime() + MIN_GAP_DAYS * MS_PER_DAY;
      if (at.getTime() < earliest) at = nextSendTime(new Date(earliest), timezone);
    }

    const state: LadderStepState = blocked ? "blocked" : nextAssigned ? "planned" : "next";
    nextAssigned = true;
    steps.push({ step: n, tone: rung.tone, dayOffset: rung.dayOffset, state, at: at.toISOString() });
    previous = at;
  }

  return { steps, stopReason, cadenceStatus: cadence?.status ?? null };
}
