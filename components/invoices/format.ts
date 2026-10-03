/**
 * Display helpers shared by the invoice and customer screens. Pure; safe on
 * server and client. Instants are shown in the organisation's time zone;
 * calendar dates ("YYYY-MM-DD") are shown as-is.
 */
import { daysBetweenIsoDates, isoDateInZone } from "@/lib/domain/dates";
import type { InvoiceStatus } from "@/lib/db/types";

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** "Oct 9" for an instant in the org zone. Adds the year when it is not the current one. */
export function formatDay(instant: string | Date, timeZone: string, now?: Date): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const zone = safeZone(timeZone);
  const sameYear = now
    ? isoDateInZone(date, zone).slice(0, 4) === isoDateInZone(now, zone).slice(0, 4)
    : true;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: zone,
  }).format(date);
}

/** "Mon, Oct 9, 9:00 AM" for an instant in the org zone. */
export function formatDateTime(instant: string | Date, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: safeZone(timeZone),
  }).format(date);
}

/** "Oct 9, 2026" for a calendar date. */
export function formatCalendarDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Today's calendar date in the org zone. */
export function todayInZone(now: Date, timeZone: string): string {
  return isoDateInZone(now, safeZone(timeZone));
}

/** Whole days past the due date (0 or less when not yet due). */
export function daysOverdue(dueAt: string, today: string): number {
  return daysBetweenIsoDates(dueAt, today);
}

/** Display status: "overdue" is derived from an open invoice past its due date. */
export type DisplayStatus = InvoiceStatus | "overdue";

export function displayStatus(status: InvoiceStatus, dueAt: string, today: string): DisplayStatus {
  return status === "open" && dueAt < today ? "overdue" : status;
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
