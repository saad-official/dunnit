import { z } from "zod";
import { secretsMatch } from "@/app/api/_lib/secrets";
import { optionalEnv } from "@/lib/env";
import { ingestReply } from "@/lib/services/replies";
import type { Client } from "@/lib/services/shared";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Inbound customer replies (spec 3.6). POST /api/inbound/email
 *
 * Auth: header `x-inbound-secret: <CRON_SECRET>` (shared secret; configure the
 * inbound provider to send it). Needs CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SECRET_KEY, and a model key (GROQ_API_KEY or
 * GOOGLE_GENERATIVE_AI_API_KEY) for classification; without one the reply is
 * stored unclassified and the cadence pauses for review.
 *
 * Bodies accepted:
 *   Resend inbound:  { "type": "email.received", "data": { "from", "to", "subject", "text", "html" } }
 *   Testing:         { "invoiceId"?: "<uuid>", "from": "a@b.com", "text": "We'll pay Friday", "to"?, "subject"? }
 *
 * The invoice is resolved by, in order:
 *   (a) the `invoiceId` field;
 *   (b) a plus-address in `to`: reply+<invoiceId>@your-domain;
 *   (c) an invoice number in the subject, among invoices of customers whose
 *       email equals `from` (must match exactly one invoice).
 *
 * Responses: 202 { ok, invoiceId, replyId, intent } | 400 bad body | 401 bad
 * secret | 404 no invoice matched.
 */

export const maxDuration = 60;

const MAX_TEXT = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLUS_ADDRESS = /reply\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;

const addressList = z.union([z.string(), z.array(z.string())]).optional();

const ResendInbound = z.object({
  type: z.literal("email.received"),
  data: z.object({
    from: z.string().min(1),
    to: addressList,
    subject: z.string().optional().nullable(),
    text: z.string().optional().nullable(),
    html: z.string().optional().nullable(),
  }),
});

const SimpleInbound = z.object({
  invoiceId: z.string().optional(),
  from: z.string().min(1),
  to: addressList,
  subject: z.string().optional().nullable(),
  text: z.string().min(1),
});

type Normalized = {
  invoiceId?: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
};

/** "Ana Ruiz <ana@example.com>" → "ana@example.com" */
function emailAddress(value: string): string {
  const angle = /<([^>]+)>/.exec(value);
  return (angle ? angle[1] : value).trim().toLowerCase();
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : value.split(",");
}

function normalize(body: unknown): Normalized | null {
  const resend = ResendInbound.safeParse(body);
  if (resend.success) {
    const d = resend.data.data;
    return {
      from: emailAddress(d.from),
      to: toList(d.to),
      subject: d.subject ?? "",
      text: (d.text?.trim() || (d.html ? htmlToText(d.html) : "")).slice(0, MAX_TEXT),
    };
  }
  const simple = SimpleInbound.safeParse(body);
  if (simple.success) {
    const d = simple.data;
    return {
      invoiceId: d.invoiceId,
      from: emailAddress(d.from),
      to: toList(d.to),
      subject: d.subject ?? "",
      text: d.text.trim().slice(0, MAX_TEXT),
    };
  }
  return null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Resolution = { invoiceId: string; via: "invoiceId" | "plus-address" | "subject" } | { error: string };

async function invoiceExists(service: Client, id: string): Promise<boolean> {
  const { data, error } = await service.from("invoices").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`look up invoice: ${error.message}`);
  return Boolean(data);
}

async function resolveInvoice(service: Client, msg: Normalized): Promise<Resolution> {
  // (a) explicit id
  if (msg.invoiceId) {
    if (!UUID.test(msg.invoiceId)) return { error: "invoiceId is not a valid id" };
    return (await invoiceExists(service, msg.invoiceId))
      ? { invoiceId: msg.invoiceId, via: "invoiceId" }
      : { error: "no invoice with that id" };
  }

  // (b) reply+<invoiceId>@...
  for (const address of msg.to) {
    const match = PLUS_ADDRESS.exec(address);
    if (match && (await invoiceExists(service, match[1]))) return { invoiceId: match[1], via: "plus-address" };
  }

  // (c) invoice number in the subject, scoped to the sender's customer records
  if (!msg.subject.trim()) return { error: "no invoice id, plus-address or subject to match" };
  const { data: customers, error: customerError } = await service
    .from("customers")
    .select("id, org_id, email")
    .ilike("email", escapeLike(msg.from))
    .limit(50);
  if (customerError) throw new Error(`look up customers: ${customerError.message}`);
  const senders = (customers ?? []).filter((c) => c.email.trim().toLowerCase() === msg.from);
  if (senders.length === 0) return { error: "sender is not a known customer" };

  const { data: invoices, error: invoiceError } = await service
    .from("invoices")
    .select("id, number, org_id, customer_id")
    .in("customer_id", senders.map((c) => c.id))
    .limit(500);
  if (invoiceError) throw new Error(`look up invoices: ${invoiceError.message}`);

  const senderKeys = new Set(senders.map((c) => `${c.org_id}:${c.id}`));
  const matches = (invoices ?? []).filter((inv) => {
    if (!senderKeys.has(`${inv.org_id}:${inv.customer_id}`)) return false;
    const pattern = new RegExp(`(^|[^A-Za-z0-9])#?${escapeRegExp(inv.number)}(?![A-Za-z0-9])`, "i");
    return pattern.test(msg.subject);
  });
  if (matches.length === 1) return { invoiceId: matches[0].id, via: "subject" };
  if (matches.length > 1) {
    // Prefer the longest number ("INV-10" vs "INV-100") when one contains another.
    const longest = Math.max(...matches.map((m) => m.number.length));
    const best = matches.filter((m) => m.number.length === longest);
    if (best.length === 1) return { invoiceId: best[0].id, via: "subject" };
    return { error: "subject matches more than one invoice" };
  }
  return { error: "no invoice number from this sender found in the subject" };
}

export async function POST(request: Request) {
  if (!secretsMatch(request.headers.get("x-inbound-secret"), optionalEnv("CRON_SECRET"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  const msg = normalize(body);
  if (!msg) return Response.json({ error: "unrecognised payload" }, { status: 400 });
  if (!msg.text) return Response.json({ error: "email has no text body" }, { status: 400 });

  try {
    const service = createServiceClient();
    const resolved = await resolveInvoice(service, msg);
    if ("error" in resolved) {
      console.info("[inbound] no invoice matched:", resolved.error);
      return Response.json({ error: "no matching invoice", detail: resolved.error }, { status: 404 });
    }

    const result = await ingestReply(service, {
      invoiceId: resolved.invoiceId,
      fromEmail: msg.from,
      rawText: msg.text,
      simulated: false,
      actor: "webhook",
    });
    const intent = result.classification?.intent ?? null;
    console.info(`[inbound] reply ${result.reply.id} on invoice ${resolved.invoiceId} via ${resolved.via}: ${intent ?? "unclassified"}`);
    return Response.json(
      { ok: true, invoiceId: resolved.invoiceId, replyId: result.reply.id, intent },
      { status: 202 },
    );
  } catch (error) {
    console.error("[inbound] failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "could not process reply" }, { status: 500 });
  }
}
