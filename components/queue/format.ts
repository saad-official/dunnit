/** Small, dependency-free formatters shared by the queue and inbox UI (server and client safe). */

const TONE_LABELS: Record<string, string> = {
  friendly: "Friendly",
  firm: "Firm",
  formal: "Formal",
  final: "Final notice",
  check_in: "Check-in",
  reply: "Reply",
};

export function toneLabel(tone: string): string {
  return TONE_LABELS[tone] ?? tone;
}

/** "Step 2 of 4 · Firm", or just "Check-in" / "Reply" for off-ladder touches. */
export function stepToneLabel(step: number, tone: string): string {
  if (step >= 1 && step <= 4) return `Step ${step} of 4 · ${toneLabel(tone)}`;
  return toneLabel(tone);
}

export function overdueLabel(daysOverdue: number): string {
  if (daysOverdue > 1) return `${daysOverdue} days overdue`;
  if (daysOverdue === 1) return "1 day overdue";
  if (daysOverdue === 0) return "Due today";
  if (daysOverdue === -1) return "Due tomorrow";
  return `Due in ${-daysOverdue} days`;
}

/** "Sep 30" (or "Sep 30, 2025" outside the current year) for a YYYY-MM-DD calendar date. */
export function formatCalendarDate(iso: string, now = new Date()): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(y === now.getUTCFullYear() ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(date);
}

/** "Oct 3, 14:05" for an instant, read in the given IANA zone. */
export function formatDateTime(isoInstant: string, timeZone = "UTC"): string {
  const date = new Date(isoInstant);
  if (Number.isNaN(date.getTime())) return isoInstant;
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function percent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100);
}
