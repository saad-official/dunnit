/** Results returned by the queue Server Actions. Plain data, safe across the server/client boundary. */

export type ActionError = { ok: false; error: string; details?: string[] };

export type SendFeedback = {
  /** True when the provider accepted the message (or the Outbox stored it). */
  sent: boolean;
  /** Toast headline, e.g. "Stored in Outbox" or "Delivered to owner@example.com (demo)". */
  title: string;
  description?: string;
};

export type ApproveResult = { ok: true; feedback: SendFeedback } | ActionError;

export type SimpleResult = { ok: true; message: string } | ActionError;

export type BulkApproveResult =
  | { ok: true; approved: number; sent: number; notSent: number; failures: string[] }
  | ActionError;

export type RunAgentResult =
  | { ok: true; drafted: number; sent: number; skipped: number; errors: string[]; durationMs: number }
  | ActionError;
