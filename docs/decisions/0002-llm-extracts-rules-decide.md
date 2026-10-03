# 0002. The LLM extracts and drafts; deterministic rules decide

- Status: accepted
- Date: 2026-10-03

## Context

Dunnit acts on money conversations with a business's customers. A wrong action, like chasing an invoice that was paid, missing a dispute, or emailing someone who unsubscribed, costs the owner money and goodwill. LLMs are good at reading a messy reply ("we'll pay on the 15th, but line 3 looks wrong") and at writing in the owner's voice. They are not reliable at applying business policy the same way every time, and their output is hard to test. The free-tier models we use (Groq gpt-oss-20b, Gemini Flash-Lite as fallback) also have tight rate limits, so every call has to count.

## Decision

The work is split into two layers with a typed boundary between them.

1. **The model only produces structured data.** Every call has a versioned prompt (`lib/ai/*`) and a Zod/JSON schema for its output:
   - Draft writer returns `{subject, body, confidence, rationale}`.
   - Reply classifier returns `{intent, promise_date?, amount_cents?, summary, suggested_action, confidence}`.
   If the output does not parse, the call fails or falls back to the other model. Free text is never interpreted.
2. **Deterministic domain rules make every state change.** Pure TypeScript in `lib/domain/*` decides what happens: the cadence planner (ladder, risk adjustments, send window, 5-day spacing, `do_not_contact`), the guardrails (invoice number and amount present, no placeholders, length limits, banned phrases), and the reply rules (for example `dispute` sets the invoice to `disputed` and pauses the cadence, `unsubscribe` sets `do_not_contact`). The model suggests; the rules act. Guardrail failures set confidence to 0 and force approval. These modules are fully unit-tested with Vitest, and AI schemas get contract tests against recorded fixtures.
3. **Every action is logged.** Each model call and each rule-driven change writes a row to `agent_events` (actor, type, entity, input, output, model, prompt version, tokens, latency). The table is append-only: a trigger rejects UPDATE and DELETE for every role. It drives the activity timeline and is how we debug and audit behaviour.
4. **Humans approve by default.** Every org starts at `autonomy = 'manual'`, so every drafted touch waits in the approval queue. Auto-send is opt-in, Pro-only, and limited: `auto_step1` sends only step-1 friendly reminders with confidence of at least 0.8 that pass the guardrails. Escalations (disputes, final notices) always go to a person.

## Consequences

- Behaviour that matters (who gets emailed, when, and what happens to an invoice) is deterministic, testable and the same across model versions. Swapping or falling back between models changes wording and classification quality, not policy.
- The model's influence is limited to its schema fields. A prompt injection in a customer reply can at most mislabel an intent, and the rules plus human approval contain that.
- Adding a new intent or action means changing the schema, the rules and the tests together. That is slower than "just ask the model", and deliberately so.
- `agent_events` grows without limit and cannot be edited. Retention or archiving will need a separate, explicit decision.
- Manual approval by default adds work for the owner at first. The autonomy setting and confidence scores are how the product earns trust before it removes that step.
