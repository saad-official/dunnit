/**
 * Guardrails applied to every LLM draft before it is saved (spec 3.3), and the
 * autonomy decision that gates auto-send (spec 3.2 / 3.4).
 */
import type { Customer, DraftOutput, Organization } from "./types";

export interface DraftContext {
  invoiceNumber: string;
  /** Exactly as rendered by formatCents for this invoice. */
  amountFormatted: string;
  customerName: string;
  /** Org voice signature; when present in the body it counts as a sign-off. */
  signature?: string;
}

export type ViolationCode =
  | "missing_invoice_number"
  | "missing_amount"
  | "placeholder"
  | "subject_length"
  | "body_length"
  | "banned_phrase"
  | "shouting"
  | "exclamation"
  | "missing_sign_off";

export interface Violation {
  code: ViolationCode;
  message: string;
}

export interface DraftValidation {
  ok: boolean;
  violations: Violation[];
  /** Draft confidence clamped to [0, 1], or 0 when any violation exists (forces approval). */
  adjustedConfidence: number;
}

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 120;
export const BODY_MIN = 40;
export const BODY_MAX = 1800;
export const MAX_EXCLAMATIONS = 1;
/** More than this many consecutive ALL-CAPS words is shouting. */
export const MAX_CAPS_RUN = 3;

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\{\{[^}]*\}\}/, // {{customer_name}}
  /\{[A-Za-z_][\w ]*\}/, // {first_name}
  /\[[A-Z][A-Za-z]*(?:[ _][A-Za-z]+)*\]/, // [NAME], [Customer Name]
  /<<[^>]*>>/, // <<NAME>>
];

/** Legal threats, coercion and profanity. Word-bounded to avoid "courtyard" or "pursued". */
export const BANNED_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "legal action", pattern: /\blegal (?:action|proceedings?)\b/i },
  { label: "lawsuit", pattern: /\blaw ?suits?\b/i },
  // Lower-case only so a customer called "Sue" is not flagged.
  { label: "sue", pattern: /\b(?:sue|sued|suing)\b/ },
  { label: "litigation", pattern: /\b(?:litigation|litigate|prosecut\w*)\b/i },
  { label: "attorney", pattern: /\battorneys?\b/i },
  { label: "lawyer", pattern: /\blawyers?\b/i },
  { label: "court", pattern: /\b(?:courts?|small claims)\b/i },
  { label: "credit bureau", pattern: /\bcredit (?:bureaus?|agenc(?:y|ies)|reporting)\b/i },
  { label: "collection agency", pattern: /\b(?:collections? agenc(?:y|ies)|debt collect\w*)\b/i },
  { label: "police", pattern: /\b(?:police|arrest\w*|jail|prison)\b/i },
  { label: "or else", pattern: /\bor else\b/i },
  { label: "profanity", pattern: /\b(?:fuck\w*|shit\w*|bitch\w*|bastard\w*|asshole\w*|damn\w*|crap|piss\w*|wtf)\b/i },
];

const SIGN_OFF =
  /^(?:thanks|thank you|many thanks|with thanks|best|best regards|best wishes|all the best|kind regards|warm regards|warmly|regards|sincerely|yours sincerely|yours truly|cheers|respectfully)\b/i;

function normalizeSpaces(text: string): string {
  return text.replace(/[  ]/g, " ");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function longestCapsRun(text: string): number {
  let longest = 0;
  let run = 0;
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (/^[A-Z]{2,}$/.test(token)) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return longest;
}

function hasSignOff(body: string, signature: string | undefined): boolean {
  if (signature && signature.trim() && body.includes(normalizeSpaces(signature.trim()))) return true;
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.slice(-4).some((line) => SIGN_OFF.test(line));
}

export function validateDraft(draft: DraftOutput, ctx: DraftContext): DraftValidation {
  const subject = normalizeSpaces(draft.subject).trim();
  const body = normalizeSpaces(draft.body).trim();
  const violations: Violation[] = [];
  const add = (code: ViolationCode, message: string) => violations.push({ code, message });

  if (!body.includes(ctx.invoiceNumber)) {
    add("missing_invoice_number", `Body must mention invoice ${ctx.invoiceNumber}.`);
  }
  if (!body.includes(normalizeSpaces(ctx.amountFormatted))) {
    add("missing_amount", `Body must state the amount ${ctx.amountFormatted}.`);
  }

  const placeholder = PLACEHOLDER_PATTERNS.map((p) => p.exec(`${subject}\n${body}`)).find((m) => m !== null);
  if (placeholder) add("placeholder", `Unreplaced placeholder "${placeholder[0]}".`);

  if (subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX) {
    add("subject_length", `Subject must be ${SUBJECT_MIN}-${SUBJECT_MAX} characters (got ${subject.length}).`);
  }
  if (body.length < BODY_MIN || body.length > BODY_MAX) {
    add("body_length", `Body must be ${BODY_MIN}-${BODY_MAX} characters (got ${body.length}).`);
  }

  const fullText = `${subject}\n${body}`;
  const banned = BANNED_PATTERNS.filter(({ pattern }) => pattern.test(fullText)).map((b) => b.label);
  if (banned.length > 0) add("banned_phrase", `Contains banned language: ${banned.join(", ")}.`);

  // The customer's own name may legitimately be upper case (e.g. "ACME CORP LTD").
  const names = [ctx.customerName].filter((n) => n.trim().length > 0);
  const capsText = names.reduce(
    (text, name) => text.replace(new RegExp(escapeRegExp(normalizeSpaces(name)), "g"), " | "),
    fullText,
  );
  if (longestCapsRun(capsText) > MAX_CAPS_RUN) {
    add("shouting", `More than ${MAX_CAPS_RUN} consecutive ALL-CAPS words.`);
  }

  const exclamations = (fullText.match(/!/g) ?? []).length;
  if (exclamations > MAX_EXCLAMATIONS) {
    add("exclamation", `At most ${MAX_EXCLAMATIONS} exclamation mark allowed (got ${exclamations}).`);
  }

  if (!hasSignOff(body, ctx.signature)) {
    add("missing_sign_off", "Body must end with a sign-off (e.g. \"Thanks,\" or the org signature).");
  }

  const clamped = Number.isFinite(draft.confidence) ? Math.min(1, Math.max(0, draft.confidence)) : 0;
  return {
    ok: violations.length === 0,
    violations,
    adjustedConfidence: violations.length === 0 ? clamped : 0,
  };
}

export type AutonomyDecision = "auto_send" | "needs_approval";

export const AUTO_STEP1_MIN_CONFIDENCE = 0.8;
export const AUTO_LOW_RISK_MIN_CONFIDENCE = 0.85;
export const AUTO_LOW_RISK_MAX_STEP = 2;
/** Customer riskScore must be strictly below this for auto_all_low_risk. */
export const AUTO_LOW_RISK_RISK_CEILING = 40;

/**
 * Whether a draft (already passed through validateDraft; pass its adjustedConfidence)
 * may be sent without approval.
 *
 * - free plan or `manual`: always approval.
 * - `auto_step1` (Pro): step 1 with confidence >= 0.8.
 * - `auto_all_low_risk` (Pro): everything auto_step1 allows, plus any step <= 2 with
 *   confidence >= 0.85 when the customer's riskScore < 40 (customer required).
 * - Never for a do-not-contact customer or a non-finite confidence.
 */
export function decideAutonomy(
  org: Pick<Organization, "plan" | "autonomy">,
  step: number,
  confidence: number,
  customer?: Pick<Customer, "riskScore" | "doNotContact">,
): AutonomyDecision {
  if (org.plan !== "pro" || org.autonomy === "manual") return "needs_approval";
  if (!Number.isFinite(confidence)) return "needs_approval";
  if (customer?.doNotContact) return "needs_approval";

  const step1Ok = step === 1 && confidence >= AUTO_STEP1_MIN_CONFIDENCE;
  if (org.autonomy === "auto_step1") return step1Ok ? "auto_send" : "needs_approval";

  const lowRiskOk =
    customer !== undefined &&
    step >= 1 &&
    step <= AUTO_LOW_RISK_MAX_STEP &&
    confidence >= AUTO_LOW_RISK_MIN_CONFIDENCE &&
    customer.riskScore < AUTO_LOW_RISK_RISK_CEILING;
  return step1Ok || lowRiskOk ? "auto_send" : "needs_approval";
}
