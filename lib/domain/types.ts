import { z } from "zod";

/**
 * Calendar date with no time or zone, "YYYY-MM-DD" (Postgres `date`).
 * Timestamps (`timestamptz`) are modelled as `Date`.
 */
export type IsoDate = string;

export type Autonomy = "manual" | "auto_step1" | "auto_all_low_risk";
export type Plan = "free" | "pro";

export interface OrgVoice {
  businessName: string;
  signature: string;
  toneNotes: string;
}

export interface Organization {
  id: string;
  name: string;
  /** IANA zone, e.g. "America/New_York". */
  timezone: string;
  voice: OrgVoice;
  autonomy: Autonomy;
  plan: Plan;
}

/** customers.contact_flag; set by reply handling or bounces. */
export type ContactFlag = "none" | "wrong_contact" | "bounced" | "unsubscribed";

export interface Customer {
  id: string;
  orgId: string;
  name: string;
  email: string;
  company?: string;
  /** 0 (reliable payer) to 100 (high risk). */
  riskScore: number;
  doNotContact: boolean;
  /** Defaults to "none" when absent. */
  contactFlag?: ContactFlag;
}

export type InvoiceStatus =
  | "open"
  | "pending_verification"
  | "paid"
  | "disputed"
  | "written_off"
  | "paused";

export interface Invoice {
  id: string;
  orgId: string;
  customerId: string;
  number: string;
  amountCents: number;
  /** ISO 4217, upper case. */
  currency: string;
  issuedAt: IsoDate;
  dueAt: IsoDate;
  status: InvoiceStatus;
  paidAt?: Date;
}

export type CadenceStep = 0 | 1 | 2 | 3 | 4;
export type CadenceStatus = "active" | "paused" | "completed" | "stopped";

export interface Cadence {
  id: string;
  invoiceId: string;
  /** Last step sent; 0 means nothing sent yet. `nextRunAt` is for the following planned step. */
  step: CadenceStep;
  nextRunAt: Date;
  status: CadenceStatus;
  /** Undefined while paused means "until handled" (indefinite). */
  pausedUntil?: Date;
  pauseReason?: string;
}

export type Tone = "friendly" | "firm" | "formal" | "final";
export type TouchStatus = "draft" | "approved" | "sent" | "rejected" | "skipped";

export interface Touch {
  id: string;
  invoiceId: string;
  step: 1 | 2 | 3 | 4;
  tone: Tone;
  subject: string;
  body: string;
  status: TouchStatus;
  confidence: number;
  sentAt?: Date;
}

export const REPLY_INTENTS = [
  "paid",
  "promise_to_pay",
  "dispute",
  "question",
  "wrong_contact",
  "out_of_office",
  "unsubscribe",
  "other",
] as const;

export const ReplyIntentSchema = z.enum(REPLY_INTENTS);
export type ReplyIntent = z.infer<typeof ReplyIntentSchema>;

const Confidence = z.number().min(0, { error: "confidence must be >= 0" }).max(1, {
  error: "confidence must be <= 1",
});

/**
 * Optional fields are `nullish` because structured-output LLMs commonly emit
 * `null` for absent values.
 */
export const ReplyClassificationSchema = z.object({
  intent: ReplyIntentSchema,
  promiseDate: z.iso.date({ error: "promiseDate must be YYYY-MM-DD" }).nullish(),
  amountCents: z.int({ error: "amountCents must be an integer" }).nonnegative().nullish(),
  summary: z.string(),
  suggestedAction: z.string(),
  confidence: Confidence,
});
export type ReplyClassification = z.infer<typeof ReplyClassificationSchema>;

export const DraftOutputSchema = z.object({
  subject: z.string().min(1, { error: "subject is required" }),
  body: z.string().min(1, { error: "body is required" }),
  confidence: Confidence,
  rationale: z.string(),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

export interface Reply {
  id: string;
  invoiceId: string;
  receivedAt: Date;
  classification: ReplyClassification | null;
  handled: boolean;
}
