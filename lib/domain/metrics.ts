/**
 * Dashboard metrics (spec 3.7). Pure: callers inject `now`.
 * Amounts are summed in minor units without currency conversion (multi-currency
 * conversion is out of scope for v1); callers should filter to one currency.
 */
import {
  addDaysToIsoDate,
  daysBetweenIsoDates,
  isoDateInZone,
  isoWeekday,
  zonedTimeToUtc,
} from "./dates";
import { MIN_CLASSIFICATION_CONFIDENCE } from "./replies";
import type { Invoice, InvoiceStatus, IsoDate, Reply, Touch } from "./types";

export const TREND_WEEKS = 12;
export const DSO_WINDOW_DAYS = 90;
export const PROMISE_GRACE_DAYS = 3;

const OUTSTANDING: ReadonlySet<InvoiceStatus> = new Set(["open", "pending_verification", "disputed", "paused"]);

export interface DsoPoint {
  /** Monday (org-local) starting the week. */
  weekStart: IsoDate;
  /** Days sales outstanding at the week end (or now for the current week); null when nothing billed in the trailing 90 days. */
  dso: number | null;
}

export interface RecoveredPoint {
  weekStart: IsoDate;
  cents: number;
}

export interface Metrics {
  outstandingCents: number;
  overdueCents: number;
  recoveredAfterTouchCents: number;
  /** 0..1 over resolved promises; null when none resolved. */
  promiseKeptRate: number | null;
  medianDaysToPay: number | null;
  queueSize: number;
  dsoTrend: DsoPoint[];
  recoveredPerWeek: RecoveredPoint[];
}

export interface MetricsOptions {
  /** Org IANA zone used for "today" and week boundaries. Default "UTC". */
  timezone?: string;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const sum = (values: Iterable<number>): number => {
  let total = 0;
  for (const v of values) total += v;
  return total;
};

/** Unpaid at instant `at`. Written-off invoices are always excluded (write-off date is not tracked). */
function outstandingAt(invoice: Invoice, at: Date): boolean {
  if (invoice.status === "written_off") return false;
  if (invoice.status === "paid") return invoice.paidAt !== undefined && invoice.paidAt.getTime() > at.getTime();
  return true;
}

export function computeMetrics(
  invoices: readonly Invoice[],
  touches: readonly Touch[],
  replies: readonly Reply[],
  now: Date,
  options: MetricsOptions = {},
): Metrics {
  const tz = options.timezone ?? "UTC";
  const today = isoDateInZone(now, tz);
  const byId = new Map(invoices.map((i) => [i.id, i]));

  const outstanding = invoices.filter((i) => OUTSTANDING.has(i.status));
  const outstandingCents = sum(outstanding.map((i) => i.amountCents));
  const overdueCents = sum(outstanding.filter((i) => i.dueAt < today).map((i) => i.amountCents));

  // Earliest sent touch per invoice.
  const firstSent = new Map<string, number>();
  for (const t of touches) {
    if (t.status !== "sent" || !t.sentAt) continue;
    const prev = firstSent.get(t.invoiceId);
    if (prev === undefined || t.sentAt.getTime() < prev) firstSent.set(t.invoiceId, t.sentAt.getTime());
  }
  const recovered = invoices.filter((i): i is Invoice & { paidAt: Date } => {
    if (i.status !== "paid" || !i.paidAt) return false;
    const sent = firstSent.get(i.id);
    return sent !== undefined && sent < i.paidAt.getTime();
  });
  const recoveredAfterTouchCents = sum(recovered.map((i) => i.amountCents));

  let kept = 0;
  let resolved = 0;
  for (const r of replies) {
    const c = r.classification;
    if (!c || c.intent !== "promise_to_pay" || !c.promiseDate || c.confidence < MIN_CLASSIFICATION_CONFIDENCE) {
      continue;
    }
    const invoice = byId.get(r.invoiceId);
    if (!invoice) continue;
    // Kept if paid any time up to the end of promiseDate + 3 days (org-local).
    const deadline = zonedTimeToUtc(addDaysToIsoDate(c.promiseDate, PROMISE_GRACE_DAYS + 1), 0, 0, tz).getTime();
    const paidOnTime = invoice.status === "paid" && invoice.paidAt !== undefined && invoice.paidAt.getTime() < deadline;
    if (paidOnTime) {
      kept += 1;
      resolved += 1;
    } else if (now.getTime() >= deadline) {
      resolved += 1;
    }
  }
  const promiseKeptRate = resolved === 0 ? null : kept / resolved;

  const medianDaysToPay = median(
    invoices
      .filter((i): i is Invoice & { paidAt: Date } => i.status === "paid" && i.paidAt !== undefined)
      .map((i) => daysBetweenIsoDates(i.issuedAt, isoDateInZone(i.paidAt, tz))),
  );

  const queueSize = touches.filter((t) => t.status === "draft").length;

  const currentWeekStart = addDaysToIsoDate(today, 1 - isoWeekday(today));
  const dsoTrend: DsoPoint[] = [];
  const recoveredPerWeek: RecoveredPoint[] = [];

  for (let w = TREND_WEEKS - 1; w >= 0; w--) {
    const weekStart = addDaysToIsoDate(currentWeekStart, -7 * w);
    const nextWeekStart = addDaysToIsoDate(weekStart, 7);
    const startInstant = zonedTimeToUtc(weekStart, 0, 0, tz).getTime();
    const endInstant = zonedTimeToUtc(nextWeekStart, 0, 0, tz).getTime();

    const asOfDate = w === 0 ? today : addDaysToIsoDate(nextWeekStart, -1);
    const asOf = w === 0 ? now : new Date(endInstant);
    const windowStart = addDaysToIsoDate(asOfDate, -DSO_WINDOW_DAYS);

    const billed = sum(
      invoices.filter((i) => i.issuedAt > windowStart && i.issuedAt <= asOfDate).map((i) => i.amountCents),
    );
    const owed = sum(
      invoices.filter((i) => i.issuedAt <= asOfDate && outstandingAt(i, asOf)).map((i) => i.amountCents),
    );
    const dso = billed === 0 ? null : Math.round(((owed * DSO_WINDOW_DAYS) / billed) * 10) / 10;
    dsoTrend.push({ weekStart, dso });

    const cents = sum(
      recovered
        .filter((i) => i.paidAt.getTime() >= startInstant && i.paidAt.getTime() < endInstant)
        .map((i) => i.amountCents),
    );
    recoveredPerWeek.push({ weekStart, cents });
  }

  return {
    outstandingCents,
    overdueCents,
    recoveredAfterTouchCents,
    promiseKeptRate,
    medianDaysToPay,
    queueSize,
    dsoTrend,
    recoveredPerWeek,
  };
}
