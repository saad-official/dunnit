import "server-only";
import { toDomainInvoice, toDomainReply, toDomainTouch } from "@/lib/db/mappers";
import type { AgentEvent, Invoice as InvoiceRow, Reply as ReplyRow, Touch as TouchRow } from "@/lib/db/types";
import { computeMetrics, type Metrics } from "@/lib/domain/metrics";
import type { Client } from "@/lib/services/shared";

/**
 * Dashboard data loading. Works with either client: the per-request client
 * (RLS scopes rows to the caller) or the service client (a future digest job),
 * which is why every query also filters by org_id explicitly.
 */

export type DashboardMetrics = Metrics & {
  /** Every invoice in the org, any status or currency. Zero means "show the empty state". */
  invoiceCount: number;
  /** The currency the money figures are reported in (the org's most common one). */
  currency: string;
  /** Invoices left out of the money figures because they are in another currency. */
  otherCurrencyCount: number;
};

const PAGE = 1000;

/** PostgREST caps a response at 1000 rows; page through so large orgs are not silently truncated. */
async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

function dominantCurrency(invoices: readonly InvoiceRow[]): string {
  const counts = new Map<string, number>();
  for (const i of invoices) counts.set(i.currency, (counts.get(i.currency) ?? 0) + 1);
  let best = "USD";
  let bestCount = 0;
  for (const [currency, count] of counts) {
    if (count > bestCount || (count === bestCount && currency === "USD")) {
      best = currency;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Fetches the org's invoices, sent/draft touches and promise-to-pay replies,
 * maps them to domain models and runs computeMetrics (spec 3.7).
 * Money is summed in one currency (no FX in v1): the org's most common one.
 */
export async function loadMetrics(
  client: Client,
  orgId: string,
  now: Date,
  timezone: string,
): Promise<DashboardMetrics> {
  const [invoiceRows, touchRows, replyRows] = await Promise.all([
    fetchAll<InvoiceRow>(
      (from, to) => client.from("invoices").select("*").eq("org_id", orgId).order("id").range(from, to),
      "load invoices",
    ),
    fetchAll<TouchRow>(
      (from, to) =>
        client
          .from("touches")
          .select("*")
          .eq("org_id", orgId)
          .in("status", ["sent", "draft"])
          .order("id")
          .range(from, to),
      "load touches",
    ),
    fetchAll<ReplyRow>(
      (from, to) =>
        client
          .from("replies")
          .select("*")
          .eq("org_id", orgId)
          .eq("intent", "promise_to_pay")
          .order("id")
          .range(from, to),
      "load replies",
    ),
  ]);

  const currency = dominantCurrency(invoiceRows);
  const sameCurrency = invoiceRows.filter((i) => i.currency === currency);
  const ids = new Set(sameCurrency.map((i) => i.id));

  const metrics = computeMetrics(
    sameCurrency.map(toDomainInvoice),
    touchRows.filter((t) => ids.has(t.invoice_id)).map(toDomainTouch),
    replyRows.filter((r) => ids.has(r.invoice_id)).map(toDomainReply),
    now,
    { timezone: timezone || "UTC" },
  );

  return {
    ...metrics,
    invoiceCount: invoiceRows.length,
    currency,
    otherCurrencyCount: invoiceRows.length - sameCurrency.length,
  };
}

/** An agent_events row plus the context needed to describe it in words. */
export type ActivityEvent = Pick<
  AgentEvent,
  "id" | "type" | "actor" | "entity_type" | "entity_id" | "input" | "output" | "model" | "created_at"
> & {
  invoiceNumber: string | null;
  step: number | null;
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

/**
 * The org's most recent agent events with the invoice number (and ladder
 * step, for touches) resolved, so the dashboard can say "Draft created for
 * #1042 (step 2, 86%)" instead of showing ids.
 */
export async function loadRecentActivity(client: Client, orgId: string, limit = 15): Promise<ActivityEvent[]> {
  const { data, error } = await client
    .from("agent_events")
    .select("id, type, actor, entity_type, entity_id, input, output, model, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`load agent events: ${error.message}`);
  const events = data ?? [];

  const touchIds = new Set<string>();
  const replyIds = new Set<string>();
  const cadenceIds = new Set<string>();
  const invoiceIds = new Set<string>();
  for (const e of events) {
    const inputInvoice = asObject(e.input).invoiceId;
    if (typeof inputInvoice === "string") invoiceIds.add(inputInvoice);
    if (!e.entity_id) continue;
    if (e.entity_type === "touch") touchIds.add(e.entity_id);
    else if (e.entity_type === "reply") replyIds.add(e.entity_id);
    else if (e.entity_type === "cadence") cadenceIds.add(e.entity_id);
    else if (e.entity_type === "invoice") invoiceIds.add(e.entity_id);
  }

  const [touches, replies, cadences] = await Promise.all([
    touchIds.size
      ? client.from("touches").select("id, invoice_id, step").eq("org_id", orgId).in("id", [...touchIds])
      : Promise.resolve({ data: [] as { id: string; invoice_id: string; step: number }[] }),
    replyIds.size
      ? client.from("replies").select("id, invoice_id").eq("org_id", orgId).in("id", [...replyIds])
      : Promise.resolve({ data: [] as { id: string; invoice_id: string }[] }),
    cadenceIds.size
      ? client.from("cadences").select("id, invoice_id").eq("org_id", orgId).in("id", [...cadenceIds])
      : Promise.resolve({ data: [] as { id: string; invoice_id: string }[] }),
  ]);

  const touchById = new Map((touches.data ?? []).map((t) => [t.id, t]));
  const invoiceOf = new Map<string, string>();
  for (const t of touches.data ?? []) invoiceOf.set(t.id, t.invoice_id);
  for (const r of replies.data ?? []) invoiceOf.set(r.id, r.invoice_id);
  for (const c of cadences.data ?? []) invoiceOf.set(c.id, c.invoice_id);
  for (const id of invoiceOf.values()) invoiceIds.add(id);

  const invoices = invoiceIds.size
    ? await client.from("invoices").select("id, number").eq("org_id", orgId).in("id", [...invoiceIds])
    : { data: [] as { id: string; number: string }[] };
  const numberById = new Map((invoices.data ?? []).map((i) => [i.id, i.number]));

  return events.map((e) => {
    const inputInvoice = asObject(e.input).invoiceId;
    const invoiceId =
      typeof inputInvoice === "string"
        ? inputInvoice
        : e.entity_id
          ? e.entity_type === "invoice"
            ? e.entity_id
            : invoiceOf.get(e.entity_id)
          : undefined;
    const touch = e.entity_type === "touch" && e.entity_id ? touchById.get(e.entity_id) : undefined;
    return {
      ...e,
      invoiceNumber: invoiceId ? (numberById.get(invoiceId) ?? null) : null,
      step: touch ? touch.step : null,
    };
  });
}
