import type { ActivityEvent } from "@/lib/services/metrics";

/**
 * Turns agent_events rows into one-line sentences for the dashboard timeline.
 * Pure (no I/O); unknown event types fall back to a readable version of the
 * dotted type name, so new events show up without a code change.
 */

type JsonObject = Record<string, unknown>;

function obj(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

const words = (value: string) => value.replace(/[._]+/g, " ").trim();

function sentenceCase(value: string): string {
  const w = words(value);
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function invoiceLabel(number: string | null): string {
  if (!number) return "an invoice";
  return number.startsWith("#") ? number : `#${number}`;
}

function percent(confidence: number | null): string | null {
  return confidence === null ? null : `${Math.round(confidence * 100)}%`;
}

const STATUS_WORDS: Record<string, string> = {
  open: "open",
  pending_verification: "pending verification",
  paid: "paid",
  disputed: "disputed",
  written_off: "written off",
  paused: "paused",
};

export function describeEvent(event: ActivityEvent): string {
  const input = obj(event.input);
  const output = obj(event.output);
  const inv = invoiceLabel(event.invoiceNumber);
  const step = num(input.step) ?? event.step ?? num(output.step);

  switch (event.type) {
    case "draft.created": {
      const details = [
        input.checkIn ? null : step !== null && step > 0 ? `step ${step}` : null,
        percent(num(output.confidence)),
      ].filter(Boolean);
      const kind = input.checkIn ? "Check-in draft" : "Draft";
      const auto = output.decision === "auto_send" ? ", auto-approved" : "";
      return `${kind} created for ${inv}${details.length ? ` (${details.join(", ")}${auto})` : auto}`;
    }
    case "draft.unavailable":
      return `Draft skipped for ${inv}: no model provider configured`;
    case "touch.sent":
      return `Reminder for ${inv} sent${step ? ` (step ${step})` : ""}${output.demo ? " to the demo inbox" : ""}`;
    case "touch.failed":
      return `Sending the reminder for ${inv} failed`;
    case "touch.cancelled": {
      const reason = str(output.reason);
      return `Reminder for ${inv} cancelled${reason ? ` (${words(reason)})` : ""}`;
    }
    case "touch.approved":
      return `Draft for ${inv} approved`;
    case "touch.rejected":
      return `Draft for ${inv} rejected`;
    case "touch.snoozed":
      return `Draft for ${inv} snoozed`;
    case "touch.edited":
      return `Draft for ${inv} edited`;
    case "touch.edited_and_approved":
      return `Draft for ${inv} edited and approved`;
    case "reply.classified": {
      const intent = str(output.intent);
      const confidence = percent(num(output.confidence));
      return `Reply on ${inv} read as ${intent ? words(intent) : "unclear"}${confidence ? ` (${confidence})` : ""}`;
    }
    case "reply.simulated":
      return `Simulated customer reply on ${inv}`;
    case "reply.unclassified":
      return `Reply on ${inv} needs a human read`;
    case "reply.handled": {
      const status = str(output.invoiceStatus);
      return status
        ? `Reply on ${inv} applied: invoice now ${STATUS_WORDS[status] ?? words(status)}`
        : `Reply on ${inv} applied`;
    }
    case "reply.marked_handled":
      return `Reply on ${inv} marked handled`;
    case "invoice.created": {
      const source = str(input.source);
      return `Invoice ${inv} added${source && source !== "manual" ? ` from ${source === "csv" ? "CSV" : source}` : ""}`;
    }
    case "invoice.paid":
      return `Invoice ${inv} marked paid`;
    case "invoice.status_changed": {
      const status = str(output.status);
      return `Invoice ${inv} set to ${status ? (STATUS_WORDS[status] ?? words(status)) : "a new status"}`;
    }
    case "invoices.imported": {
      const created = num(output.created) ?? 0;
      const errors = num(output.errors) ?? 0;
      return `Imported ${created} invoice${created === 1 ? "" : "s"} from CSV${errors ? ` (${errors} row${errors === 1 ? "" : "s"} skipped)` : ""}`;
    }
    case "demo.seeded": {
      const invoices = num(output.invoices);
      const customers = num(output.customers);
      return invoices !== null && customers !== null
        ? `Demo data loaded: ${customers} customers, ${invoices} invoices`
        : "Demo data loaded";
    }
    case "cadence.resumed":
      return `Reminders resumed for ${inv}`;
    case "agent.run": {
      const drafted = num(output.drafted) ?? 0;
      const sent = num(output.sent) ?? 0;
      return `Agent run: ${drafted} drafted, ${sent} sent`;
    }
    default:
      return event.invoiceNumber ? `${sentenceCase(event.type)} for ${inv}` : sentenceCase(event.type);
  }
}

const ACTORS: Record<string, string> = {
  agent: "Agent",
  user: "You",
  system: "System",
  cron: "Scheduler",
  webhook: "Webhook",
};

export function actorLabel(actor: string): string {
  return ACTORS[actor] ?? sentenceCase(actor);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function relativeTime(iso: string, now: Date): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds / 60), "minute");
}
