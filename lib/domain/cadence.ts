/**
 * Deterministic cadence planner (spec 3.2). Pure: callers inject `now`.
 */
import {
  addDaysToIsoDate,
  getZonedParts,
  isoDateInZone,
  isoWeekday,
  MS_PER_DAY,
  zonedTimeToUtc,
} from "./dates";
import type { Cadence, Customer, Invoice, Tone } from "./types";

export interface SendWindow {
  /** ISO weekdays allowed, 1 = Monday ... 7 = Sunday. */
  weekdays: number[];
  /** Inclusive local start hour. */
  startHour: number;
  /** Exclusive local end hour: 18 means the last allowed minute is 17:59. */
  endHour: number;
}

export const DEFAULT_SEND_WINDOW: SendWindow = { weekdays: [1, 2, 3, 4, 5], startHour: 8, endHour: 18 };
export const DEFAULT_SEND_HOUR = 9;
export const MIN_GAP_DAYS = 5;
export const HIGH_RISK_THRESHOLD = 70;
export const LOW_RISK_THRESHOLD = 20;

export interface CadencePolicy {
  /** IANA zone of the organisation. */
  timezone: string;
  sendWindow?: SendWindow;
  /** Preferred local hour for a step on its scheduled day (default 9). */
  sendHour?: number;
  minGapDays?: number;
}

export type PlannedStepNumber = 1 | 2 | 3 | 4;

export interface PlannedStep {
  step: PlannedStepNumber;
  tone: Tone;
  /** Calendar days after the due date the step was planned for (before window/gap adjustment). */
  dayOffset: number;
  scheduledAt: Date;
}

const LADDER: ReadonlyArray<{ step: PlannedStepNumber; tone: Tone; dayOffset: number }> = [
  { step: 1, tone: "friendly", dayOffset: 1 },
  { step: 2, tone: "firm", dayOffset: 7 },
  { step: 3, tone: "formal", dayOffset: 14 },
  { step: 4, tone: "final", dayOffset: 30 },
];

function assertWindow(window: SendWindow): void {
  const validDays = window.weekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  if (validDays.length === 0) throw new RangeError("Send window must allow at least one weekday (1-7)");
  if (
    !Number.isInteger(window.startHour) ||
    !Number.isInteger(window.endHour) ||
    window.startHour < 0 ||
    window.endHour > 24 ||
    window.startHour >= window.endHour
  ) {
    throw new RangeError("Send window needs integer hours with 0 <= startHour < endHour <= 24");
  }
}

/**
 * Earliest instant >= `date` that falls inside the send window in `timezone`.
 * Window boundaries are org-local wall-clock times, so the UTC result shifts
 * correctly across DST transitions.
 */
export function nextSendTime(date: Date, timezone: string, window: SendWindow = DEFAULT_SEND_WINDOW): Date {
  assertWindow(window);
  const local = getZonedParts(date, timezone);
  const allowed = new Set(window.weekdays);

  if (allowed.has(local.weekday)) {
    if (local.hour >= window.startHour && local.hour < window.endHour) return date;
    if (local.hour < window.startHour) {
      return zonedTimeToUtc(isoDateInZone(date, timezone), window.startHour, 0, timezone);
    }
  }

  const today = isoDateInZone(date, timezone);
  for (let offset = 1; offset <= 7; offset++) {
    const day = addDaysToIsoDate(today, offset);
    if (allowed.has(isoWeekday(day))) return zonedTimeToUtc(day, window.startHour, 0, timezone);
  }
  throw new RangeError("No allowed weekday found in send window");
}

/** True if `candidate` is at least `minDays` x 24h of elapsed time after `lastSentAt`. */
export function minGapOk(
  lastSentAt: Date | null | undefined,
  candidate: Date,
  minDays: number = MIN_GAP_DAYS,
): boolean {
  if (!lastSentAt) return true;
  return candidate.getTime() - lastSentAt.getTime() >= minDays * MS_PER_DAY;
}

export type StopReason =
  | "paid"
  | "written_off"
  | "do_not_contact"
  | "contact_flagged"
  | "invoice_paused"
  | "disputed"
  | "pending_verification";

/**
 * Why no reminder may be sent for this invoice right now, or null if chasing may continue.
 * Beyond the spec's paid / written-off / do-not-contact / paused rules, disputed and
 * pending-verification invoices also block sending (a reply put them on hold), as does
 * a customer whose contact is flagged wrong_contact or bounced (until the owner fixes it).
 */
export function shouldStop(
  invoice: Pick<Invoice, "status">,
  customer: Pick<Customer, "doNotContact" | "contactFlag">,
): StopReason | null {
  switch (invoice.status) {
    case "paid":
      return "paid";
    case "written_off":
      return "written_off";
  }
  if (customer.doNotContact) return "do_not_contact";
  if (customer.contactFlag === "wrong_contact" || customer.contactFlag === "bounced") return "contact_flagged";
  switch (invoice.status) {
    case "paused":
      return "invoice_paused";
    case "disputed":
      return "disputed";
    case "pending_verification":
      return "pending_verification";
    default:
      return null;
  }
}

function ladderFor(riskScore: number): Array<{ step: PlannedStepNumber; tone: Tone; dayOffset: number }> {
  if (riskScore >= HIGH_RISK_THRESHOLD) {
    // Skip the friendly nudge; the firm step moves up to due+1.
    return LADDER.filter((s) => s.step !== 1).map((s) => (s.step === 2 ? { ...s, dayOffset: 1 } : { ...s }));
  }
  if (riskScore <= LOW_RISK_THRESHOLD) {
    return LADDER.map((s) => (s.step === 1 ? { ...s, dayOffset: 3 } : { ...s }));
  }
  return LADDER.map((s) => ({ ...s }));
}

/**
 * Plans the reminder ladder for an invoice.
 *
 * Each step targets `sendHour` (default 09:00) org-local on due date + offset,
 * then is pushed (never pulled) by, in order: `now` (no past sends), the minimum
 * gap after the previous step, and the send window. A long-overdue invoice
 * therefore starts at the next send slot and keeps all steps, spaced by the gap.
 * Returns [] when `shouldStop` blocks the invoice.
 */
export function planCadence(
  invoice: Invoice,
  customer: Customer,
  policy: CadencePolicy,
  now: Date,
): PlannedStep[] {
  if (shouldStop(invoice, customer)) return [];

  const window = policy.sendWindow ?? DEFAULT_SEND_WINDOW;
  const sendHour = policy.sendHour ?? DEFAULT_SEND_HOUR;
  const minGapDays = policy.minGapDays ?? MIN_GAP_DAYS;

  const planned: PlannedStep[] = [];
  let previous: Date | null = null;

  for (const rung of ladderFor(customer.riskScore)) {
    const day = addDaysToIsoDate(invoice.dueAt, rung.dayOffset);
    let candidate = zonedTimeToUtc(day, sendHour, 0, policy.timezone).getTime();
    candidate = Math.max(candidate, now.getTime());
    if (previous) candidate = Math.max(candidate, previous.getTime() + minGapDays * MS_PER_DAY);
    const scheduledAt = nextSendTime(new Date(candidate), policy.timezone, window);
    planned.push({ step: rung.step, tone: rung.tone, dayOffset: rung.dayOffset, scheduledAt });
    previous = scheduledAt;
  }

  return planned;
}

function withoutPauseFields(cadence: Cadence): Cadence {
  const { id, invoiceId, step, nextRunAt, status } = cadence;
  return { id, invoiceId, step, nextRunAt, status };
}

/**
 * Pauses an active (or re-pauses a paused) cadence. Without `until` the pause is
 * indefinite ("until handled"). With `until`, nextRunAt is pushed to at least `until`.
 * Stopped/completed cadences are returned unchanged.
 */
export function pauseFor(cadence: Cadence, reason: string, until?: Date): Cadence {
  if (cadence.status === "stopped" || cadence.status === "completed") return cadence;
  const base = withoutPauseFields(cadence);
  const paused: Cadence = { ...base, status: "paused", pauseReason: reason };
  if (until) {
    paused.pausedUntil = until;
    if (until.getTime() > cadence.nextRunAt.getTime()) paused.nextRunAt = until;
  }
  return paused;
}

/**
 * Re-activates a paused cadence, clearing pause fields; nextRunAt is never in the past.
 * Callers that need to know why it was paused (e.g. promise_to_pay => gentle check-in)
 * must read `pauseReason` before resuming. Non-paused cadences are returned unchanged.
 */
export function resume(cadence: Cadence, now: Date): Cadence {
  if (cadence.status !== "paused") return cadence;
  const nextRunAt = cadence.nextRunAt.getTime() > now.getTime() ? cadence.nextRunAt : now;
  return { ...withoutPauseFields(cadence), status: "active", nextRunAt };
}

/** True when a timed pause has reached its end (cron should resume it). */
export function isPauseExpired(cadence: Cadence, now: Date): boolean {
  return (
    cadence.status === "paused" &&
    cadence.pausedUntil !== undefined &&
    cadence.pausedUntil.getTime() <= now.getTime()
  );
}
