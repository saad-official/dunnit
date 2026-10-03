import "server-only";
import { logAgentEvent, type Actor } from "@/lib/ai/log";
import { toDomainCustomer, toDomainInvoice, parseVoice } from "@/lib/db/mappers";
import { getEmailProvider } from "@/lib/email/provider";
import { renderReminderEmail } from "@/lib/email/templates";
import { shouldStop } from "@/lib/domain/cadence";
import { formatCents } from "@/lib/domain/money";
import { advanceCadence, ensureCadence } from "@/lib/services/cadences";
import { formatIsoDate, loadInvoiceBundle, unwrap, type Client } from "@/lib/services/shared";

export type SendOutcome =
  | { sent: true; touchId: string; deliveredTo: string; demo: boolean }
  | { sent: false; touchId: string; reason: string };

/**
 * Sends an approved (or user-approved-right-now) touch. Requires the service
 * client because the outbox table is write-protected for members; callers
 * must authorise the user before calling.
 */
export async function sendTouch(
  client: Client,
  touchId: string,
  actor: { kind: Actor; userId?: string },
  now = new Date(),
): Promise<SendOutcome> {
  const touch = unwrap(await client.from("touches").select("*").eq("id", touchId).maybeSingle(), "load touch");
  if (!["draft", "approved", "snoozed"].includes(touch.status)) {
    return { sent: false, touchId, reason: `touch is ${touch.status}` };
  }

  const bundle = await loadInvoiceBundle(client, touch.invoice_id);
  const { org, invoice, customer } = bundle;

  const stop = shouldStop(toDomainInvoice(invoice), toDomainCustomer(customer));
  if (stop) {
    await client
      .from("touches")
      .update({ status: "cancelled", reject_reason: `blocked before send: ${stop}` })
      .eq("id", touch.id);
    await logAgentEvent(client, {
      orgId: org.id,
      actor: actor.kind,
      type: "touch.cancelled",
      entityType: "touch",
      entityId: touch.id,
      output: { reason: stop },
    });
    return { sent: false, touchId, reason: stop };
  }

  const voice = parseVoice(org);
  const rendered = renderReminderEmail({
    subject: touch.subject,
    body: touch.body,
    businessName: voice.businessName,
    invoiceNumber: invoice.number,
    amountFormatted: formatCents(invoice.amount_cents, invoice.currency),
    dueDateFormatted: formatIsoDate(invoice.due_at),
  });

  const provider = getEmailProvider();
  let result;
  try {
    result = await provider.send({ to: customer.email, subject: rendered.subject, text: rendered.text, html: rendered.html });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.from("touches").update({ status: "failed", reject_reason: message.slice(0, 500) }).eq("id", touch.id);
    await client.from("outbox").insert({
      org_id: org.id,
      touch_id: touch.id,
      to_email: customer.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      provider: provider.name,
      status: "failed",
    });
    await logAgentEvent(client, {
      orgId: org.id,
      actor: actor.kind,
      type: "touch.failed",
      entityType: "touch",
      entityId: touch.id,
      output: { message },
    });
    return { sent: false, touchId, reason: message };
  }

  await client.from("outbox").insert({
    org_id: org.id,
    touch_id: touch.id,
    to_email: result.deliveredTo,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    provider: result.provider,
    status: result.provider === "outbox" ? "queued" : "sent",
  });

  await client
    .from("touches")
    .update({
      status: "sent",
      sent_at: now.toISOString(),
      provider_message_id: result.providerMessageId,
      approved_at: touch.approved_at ?? now.toISOString(),
      approved_by: touch.approved_by ?? actor.userId ?? null,
      snoozed_until: null,
    })
    .eq("id", touch.id);

  if (bundle.cadence) {
    if (touch.step >= 1 && touch.step <= 4) {
      await advanceCadence(client, org, invoice, customer, bundle.cadence, touch.step, now);
    } else {
      // Check-in or ad-hoc touch: resume the ladder from where it was.
      await ensureCadence(client, org, invoice, customer, now, bundle.cadence.step);
    }
  }

  await logAgentEvent(client, {
    orgId: org.id,
    actor: actor.kind,
    type: "touch.sent",
    entityType: "touch",
    entityId: touch.id,
    output: {
      provider: result.provider,
      deliveredTo: result.deliveredTo,
      intendedRecipient: customer.email,
      demo: result.demo,
      step: touch.step,
    },
  });

  return { sent: true, touchId, deliveredTo: result.deliveredTo, demo: result.demo };
}
