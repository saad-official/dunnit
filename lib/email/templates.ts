/**
 * Email rendering. The agent produces subject and body as plain text; this
 * module wraps them in a minimal, readable HTML shell and a text alternative.
 * Deliberately plain: reminders from a small business should look like a
 * person wrote them, not like a marketing blast.
 */

export type ReminderEmailInput = {
  subject: string;
  body: string;
  businessName: string;
  invoiceNumber: string;
  amountFormatted: string;
  dueDateFormatted: string;
  payUrl?: string | null;
  /** Shown in the footer so the recipient can opt out. */
  unsubscribeUrl?: string | null;
};

export type RenderedEmail = { subject: string; text: string; html: string };

export function renderReminderEmail(input: ReminderEmailInput): RenderedEmail {
  const detailsText = [
    `Invoice ${input.invoiceNumber}`,
    `Amount ${input.amountFormatted}`,
    `Due ${input.dueDateFormatted}`,
    input.payUrl ? `Pay online: ${input.payUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const text = [
    input.body.trim(),
    "",
    "----",
    detailsText,
    input.unsubscribeUrl
      ? `\nPrefer not to receive reminders? ${input.unsubscribeUrl}`
      : "",
  ].join("\n");

  const paragraphs = input.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replaceAll("\n", "<br>")}</p>`)
    .join("");

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;background:#FBF8F3;padding:24px 12px;font:16px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14213D">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E9E2D3;border-radius:10px;padding:28px">
    ${paragraphs}
    <table role="presentation" style="margin:20px 0 0;border-collapse:collapse;width:100%;font-size:14px">
      <tr><td style="padding:6px 0;color:#5B6273">Invoice</td><td style="padding:6px 0;text-align:right;font-variant-numeric:tabular-nums">${escapeHtml(input.invoiceNumber)}</td></tr>
      <tr><td style="padding:6px 0;color:#5B6273;border-top:1px solid #E9E2D3">Amount</td><td style="padding:6px 0;text-align:right;border-top:1px solid #E9E2D3;font-variant-numeric:tabular-nums;font-weight:600">${escapeHtml(input.amountFormatted)}</td></tr>
      <tr><td style="padding:6px 0;color:#5B6273;border-top:1px solid #E9E2D3">Due</td><td style="padding:6px 0;text-align:right;border-top:1px solid #E9E2D3">${escapeHtml(input.dueDateFormatted)}</td></tr>
    </table>
    ${
      input.payUrl
        ? `<p style="margin:20px 0 0"><a href="${escapeAttr(input.payUrl)}" style="display:inline-block;background:#14213D;color:#FBF8F3;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Pay ${escapeHtml(input.amountFormatted)}</a></p>`
        : ""
    }
  </div>
  <p style="max-width:560px;margin:14px auto 0;font-size:12px;color:#5B6273;text-align:center">
    Sent on behalf of ${escapeHtml(input.businessName)}.${
      input.unsubscribeUrl
        ? ` <a href="${escapeAttr(input.unsubscribeUrl)}" style="color:#5B6273">Stop reminders</a>.`
        : ""
    }
  </p>
</body>
</html>`;

  return { subject: input.subject, text, html };
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value: string) {
  return escapeHtml(value);
}
