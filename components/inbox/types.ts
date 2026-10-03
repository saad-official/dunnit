import type { ReplyClassification, ReplyIntent } from "@/lib/domain/types";

/** Results returned by the Inbox Server Actions. Plain data, safe across the server/client boundary. */

export type InboxActionError = {
  ok: false;
  error: string;
  /** "ai_unavailable": no model key is configured; the UI shows a friendly inline note. */
  code?: "ai_unavailable" | "invalid" | "not_found";
};

export type InboxSimpleResult = { ok: true; message: string } | InboxActionError;

export type DemoReplyResult =
  | {
      ok: true;
      replyId: string;
      text: string;
      /** Set for "Simulate a reply": the intent the simulator aimed for. */
      intendedIntent: ReplyIntent | null;
      classification: ReplyClassification | null;
      /** Plain-English list of what Dunnit changed (invoice status, cadence, customer flags). */
      effects: string[];
      tasks: string[];
    }
  | InboxActionError;
