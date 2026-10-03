/**
 * Deterministic reply handling (spec 3.6). The LLM only classifies; every state
 * change is decided here. Pure: callers inject `now`.
 */
import { addDaysToIsoDate, MS_PER_DAY, zonedTimeToUtc } from "./dates";
import { formatCents } from "./money";
import type {
  Cadence,
  CadenceStatus,
  Customer,
  Invoice,
  InvoiceStatus,
  ReplyClassification,
} from "./types";

export const MIN_CLASSIFICATION_CONFIDENCE = 0.6;
export const OUT_OF_OFFICE_DELAY_DAYS = 3;

/** `pauseReason` values written by reply handling. `promise_to_pay` tells the tick job to send a gentle check-in on resume. */
export const PAUSE_REASONS = {
  paid: "reply_paid",
  promise_to_pay: "promise_to_pay",
  dispute: "reply_dispute",
  question: "reply_question",
  wrong_contact: "reply_wrong_contact",
  needs_review: "reply_needs_review",
} as const;

export type ReplyTaskType = "confirm_payment" | "escalation" | "draft_reply" | "fix_contact" | "review_reply";

export interface ReplyTask {
  type: ReplyTaskType;
  title: string;
  detail: string;
}

/** Fields to write on the cadence row. `null` clears a column; absent keys are untouched. */
export interface CadencePatch {
  status?: CadenceStatus;
  nextRunAt?: Date;
  pausedUntil?: Date | null;
  pauseReason?: string | null;
}

export interface ReplyOutcome {
  invoiceStatus?: InvoiceStatus;
  cadencePatch: CadencePatch;
  customerPatch?: Partial<Pick<Customer, "doNotContact" | "contactFlag">>;
  tasks: ReplyTask[];
}

export interface HandleReplyOptions {
  /** Org IANA zone; promise check-ins start at local midnight after the promise date. Default "UTC". */
  timezone?: string;
}

const TERMINAL_INVOICE: ReadonlySet<InvoiceStatus> = new Set(["paid", "written_off"]);

function isClosed(cadence: Cadence): boolean {
  return cadence.status === "stopped" || cadence.status === "completed";
}

function pausePatch(cadence: Cadence, reason: string, until?: Date): CadencePatch {
  if (isClosed(cadence)) return {};
  if (!until) return { status: "paused", pauseReason: reason, pausedUntil: null };
  const nextRunAt = until.getTime() > cadence.nextRunAt.getTime() ? until : cadence.nextRunAt;
  return { status: "paused", pauseReason: reason, pausedUntil: until, nextRunAt };
}

function nextStatus(invoice: Invoice, target: InvoiceStatus): InvoiceStatus | undefined {
  if (TERMINAL_INVOICE.has(invoice.status) || invoice.status === target) return undefined;
  return target;
}

function describe(c: ReplyClassification): string {
  const parts = [c.summary.trim(), c.suggestedAction.trim() ? `Suggested: ${c.suggestedAction.trim()}` : ""];
  return parts.filter(Boolean).join("\n");
}

function reviewTask(invoice: Invoice, c: ReplyClassification, why: string): ReplyTask {
  return {
    type: "review_reply",
    title: `Review reply on invoice ${invoice.number}`,
    detail: `${why} Classifier guessed "${c.intent}" at ${Math.round(c.confidence * 100)}% confidence.\n${describe(c)}`,
  };
}

/**
 * Maps a classified reply to state changes and owner tasks.
 *
 * Below MIN_CLASSIFICATION_CONFIDENCE (0.6) nothing changes except an indefinite
 * cadence pause plus a "review reply" task. Paid/written-off invoices never change
 * status; stopped/completed cadences are never reopened.
 */
export function handleReply(
  classification: ReplyClassification,
  invoice: Invoice,
  cadence: Cadence,
  now: Date,
  options: HandleReplyOptions = {},
): ReplyOutcome {
  const c = classification;

  if (!(c.confidence >= MIN_CLASSIFICATION_CONFIDENCE)) {
    return {
      cadencePatch: pausePatch(cadence, PAUSE_REASONS.needs_review),
      tasks: [reviewTask(invoice, c, "Low-confidence classification; no automatic changes made.")],
    };
  }

  switch (c.intent) {
    case "paid": {
      let detail = describe(c);
      if (c.amountCents != null && c.amountCents < invoice.amountCents) {
        detail += `\nPossible partial payment: customer mentions ${formatCents(c.amountCents, invoice.currency)} of ${formatCents(invoice.amountCents, invoice.currency)}.`;
      }
      return {
        invoiceStatus: nextStatus(invoice, "pending_verification"),
        cadencePatch: pausePatch(cadence, PAUSE_REASONS.paid),
        tasks: [{ type: "confirm_payment", title: `Confirm payment for invoice ${invoice.number}`, detail }],
      };
    }

    case "promise_to_pay": {
      if (!c.promiseDate) {
        return {
          cadencePatch: pausePatch(cadence, PAUSE_REASONS.promise_to_pay),
          tasks: [reviewTask(invoice, c, "Promise to pay without a date; set a follow-up date.")],
        };
      }
      const checkIn = zonedTimeToUtc(addDaysToIsoDate(c.promiseDate, 1), 0, 0, options.timezone ?? "UTC");
      const earliest = new Date(now.getTime() + MS_PER_DAY);
      const until = checkIn.getTime() > now.getTime() ? checkIn : earliest;
      return { cadencePatch: pausePatch(cadence, PAUSE_REASONS.promise_to_pay, until), tasks: [] };
    }

    case "dispute":
      return {
        invoiceStatus: nextStatus(invoice, "disputed"),
        cadencePatch: pausePatch(cadence, PAUSE_REASONS.dispute),
        tasks: [{ type: "escalation", title: `Dispute on invoice ${invoice.number}`, detail: describe(c) }],
      };

    case "question":
      return {
        cadencePatch: pausePatch(cadence, PAUSE_REASONS.question),
        tasks: [{ type: "draft_reply", title: `Answer question on invoice ${invoice.number}`, detail: describe(c) }],
      };

    case "wrong_contact":
      return {
        cadencePatch: pausePatch(cadence, PAUSE_REASONS.wrong_contact),
        customerPatch: { contactFlag: "wrong_contact" },
        tasks: [
          {
            type: "fix_contact",
            title: `Wrong contact for invoice ${invoice.number}`,
            detail: `Update the customer's billing contact before chasing again.\n${describe(c)}`,
          },
        ],
      };

    case "out_of_office": {
      if (isClosed(cadence)) return { cadencePatch: {}, tasks: [] };
      const base = Math.max(cadence.nextRunAt.getTime(), now.getTime());
      return { cadencePatch: { nextRunAt: new Date(base + OUT_OF_OFFICE_DELAY_DAYS * MS_PER_DAY) }, tasks: [] };
    }

    case "unsubscribe":
      return {
        customerPatch: { doNotContact: true, contactFlag: "unsubscribed" },
        cadencePatch: isClosed(cadence) ? {} : { status: "stopped", pausedUntil: null, pauseReason: null },
        tasks: [],
      };

    case "other":
      return {
        cadencePatch: pausePatch(cadence, PAUSE_REASONS.needs_review),
        tasks: [reviewTask(invoice, c, "Reply did not match a known intent.")],
      };
  }
}
