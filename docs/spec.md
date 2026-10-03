# Dunnit — product and technical spec

Status: approved design, 2026-10-03. Part of the [Vibe Build Series](https://github.com/saad-official/vibe-build-series).

## 1. Problem

Small service businesses invoice on net-30 terms and then chase payment by hand. The QuickBooks 2026 Late Payments Report found 59% of small businesses carry invoices 30+ days overdue, with $17.7K owed on average. Accounting tools send fixed-schedule template reminders that cannot read a reply such as "we'll pay on the 15th" or "this invoice is wrong", so owners still do the follow-up themselves or stop chasing.

Dunnit is an accounts-receivable agent for owner-operators: it plans a reminder cadence per invoice, drafts each message in the owner's voice, waits for approval (or sends on its own once trusted), reads replies, and updates the invoice accordingly. The dashboard reports in business units: dollars recovered after an agent touch, promise-to-pay kept rate, and days-sales-outstanding trend.

## 2. Users and plans

- **Owner** of an organisation (one org per account for v1; schema supports many).
- **Free plan:** up to 10 active invoices, manual approval of every message, CSV import, demo data.
- **Pro plan ($29/month, Stripe test mode):** unlimited invoices, confidence-based auto-send for step 1 reminders, Stripe invoice sync, weekly digest.

## 3. Core flows

### 3.1 Import invoices
- Manual form, CSV upload (number, customer name, email, amount, currency, issued date, due date), and "Load demo data" (synthetic customers and invoices in various states).
- Stripe sync (Pro): owner pastes a restricted test-mode key in Settings; a sync job pulls open invoices. Owner enters the key themselves.

### 3.2 Cadence planner (deterministic)
Default ladder relative to due date, adjusted by customer risk:

| Step | Day | Tone | Default autonomy |
|------|-----|------|------------------|
| 1 | due + 1 | friendly | auto-send on Pro if confidence ≥ 0.8 |
| 2 | due + 7 | firm | approval |
| 3 | due + 14 | formal, states consequences | approval |
| 4 | due + 30 | final notice, escalate to owner | approval |

Rules: respect `do_not_contact`, send window (org timezone, weekdays 08:00–18:00), one touch per invoice per 5 days minimum, pause on any inbound reply until handled, skip if invoice paid.

### 3.3 Draft writer (LLM, Groq gpt-oss-20b)
Input: invoice, customer, prior touches, replies, org voice settings (business name, signature, tone notes), step tone. Output JSON `{subject, body, confidence, rationale}`. Guardrails before saving: body must contain invoice number and amount; no placeholders left; length limits; banned phrases list (threats, legal claims). Failing guardrails lowers confidence to 0 and forces approval.

### 3.4 Approval queue
Cards show the proposed email, rationale, confidence, and invoice context. Actions: approve, edit then approve, reject with reason, snooze. Bulk approve. Keyboard shortcuts. Autonomy setting per org: `manual`, `auto_step1`, `auto_all_low_risk`.

### 3.5 Sending (email provider abstraction)
`EmailProvider` interface with two implementations:
- `OutboxProvider` (default): stores rendered email in `outbox`, visible in-app. Zero external setup.
- `ResendProvider`: used when `RESEND_API_KEY` is set. In demo mode (`EMAIL_DEMO_RECIPIENT` set) every message is delivered to the owner's inbox with a banner naming the intended recipient.

### 3.6 Replies and classification (LLM, Groq gpt-oss-20b; Gemini Flash-Lite fallback)
Inbound sources: `/api/inbound/email` webhook (Resend inbound payload shape), and the in-app Demo Inbox where the owner pastes a reply or clicks "Simulate reply" (LLM writes a plausible customer reply; clearly labelled simulated).

Classification schema: `intent ∈ {paid, promise_to_pay, dispute, question, wrong_contact, out_of_office, unsubscribe, other}`, `promise_date?`, `amount_cents?`, `summary`, `suggested_action`, `confidence`.

Deterministic handling:
- paid → invoice `pending_verification`, cadence paused, owner task "confirm payment".
- promise_to_pay → cadence paused until promise_date + 1 day, then a gentle check-in step.
- dispute → cadence paused, invoice `disputed`, escalation card with summary.
- question → draft a reply for approval, cadence paused until handled.
- wrong_contact → cadence paused, flag customer record.
- out_of_office → next touch delayed 3 days.
- unsubscribe → customer `do_not_contact = true`, cadence stopped.

### 3.7 Dashboard
Tiles: outstanding, overdue, recovered after agent touch (sum of invoices paid where ≥1 touch sent before paid_at), promise-kept rate, median days to pay, queue size. Charts: DSO trend by week, recovered per week. Activity timeline from `agent_events`.

### 3.8 Billing
Stripe Checkout for Pro, Customer Portal for management, webhooks for `checkout.session.completed`, `customer.subscription.updated|deleted`. `organizations.plan` gates features server-side.

### 3.9 Jobs
- `/api/cron/tick` (every 15 min via pg_cron + pg_net, `Authorization: Bearer CRON_SECRET`): advance due cadences, create drafts, auto-send eligible drafts, resume paused cadences whose pause expired.
- `/api/cron/daily` (Vercel cron, daily): digest email (Pro), Supabase keep-alive query.

## 4. Data model (Supabase Postgres)

```
organizations(id, name, slug, plan, stripe_customer_id, stripe_subscription_id, timezone,
              voice jsonb, autonomy text, created_at)
memberships(org_id, user_id, role)
customers(id, org_id, name, email, company, risk_score int, do_not_contact bool, notes, created_at)
invoices(id, org_id, customer_id, number, amount_cents bigint, currency, issued_at date, due_at date,
         status text, source text, external_id, paid_at, created_at)
cadences(id, invoice_id, org_id, step int, next_run_at timestamptz, status text, paused_until, pause_reason)
touches(id, org_id, invoice_id, cadence_id, step, tone, subject, body, status, confidence numeric,
        rationale, approved_by, approved_at, sent_at, provider_message_id, created_at)
replies(id, org_id, invoice_id, touch_id, from_email, raw_text, received_at, classification jsonb,
        handled bool, handled_at, simulated bool)
outbox(id, org_id, touch_id, to_email, subject, html, text, provider, status, created_at)
agent_events(id, org_id, actor, type, entity_type, entity_id, input jsonb, output jsonb, model,
             prompt_version, tokens_in, tokens_out, latency_ms, created_at)  -- append-only
```
RLS: every table filtered by `org_id` in the caller's memberships. Service role used only by cron and webhooks.

Invoice status machine: `open → (overdue is derived) → pending_verification → paid`, `open → disputed → open|written_off`, `open → paused` (manual).

## 5. Architecture

- Next.js 16 App Router. Route groups: `(marketing)` landing, pricing, legal; `(auth)` sign in/up; `(app)` dashboard, invoices, queue, inbox, customers, settings, billing.
- `proxy.ts` refreshes Supabase sessions and protects `(app)` routes.
- Server Actions for mutations; route handlers for webhooks, cron, inbound.
- `lib/domain/*`: pure TypeScript (cadence planner, guardrails, reply handling rules, metrics). Fully unit-tested with Vitest.
- `lib/ai/*`: model factory (Groq primary, Gemini fallback), prompts with versions, Zod schemas, event logging.
- `lib/email/*`: provider abstraction and templates (plain text + minimal HTML).
- `lib/stripe/*`: client, checkout, portal, webhook handler.
- `supabase/migrations/*.sql`: schema, RLS, pg_cron schedules.

## 6. Design identity

Editorial, confident, calm. Dunnit is about money conversations without the awkwardness, so the UI avoids alarm colours except for genuine escalations.

- Type: Fraunces (display, slightly soft serif) + Inter (body, UI). Tabular numerals for money.
- Palette: ink `#14213D`, paper `#FBF8F3`, sand `#E9E2D3`, signal amber `#F2A33A` (actions, promises), moss `#3F6B48` (paid, recovered), brick `#B5473B` (disputes only). Dark mode: ink background with paper text.
- Layout: left rail navigation in-app; marketing pages use a 12-column grid with generous whitespace and real product screenshots (rendered UI, not illustrations).
- Components: shadcn/ui primitives re-themed through CSS variables; no default grey-on-white look.

## 7. Testing

- Vitest: cadence planner (dates, risk adjustments, send windows), guardrails, reply rules, metrics math, CSV parser.
- Contract tests for AI schemas with recorded fixtures (no live model calls in CI).
- Playwright smoke (local): sign up, load demo data, approve a draft, simulate a reply, see dashboard update.
- CI: lint, typecheck, unit tests on every push.

## 8. Out of scope for v1

SMS, phone, multi-currency conversion, accounting write-back, multi-org switching UI, team roles beyond owner/member.

## 9. Free-tier notes

Supabase Free project (one of two allowed). Groq free: 30 RPM, 8K TPM, so prompts stay short and demo data stays small. Gemini free-tier data terms mean no real customer data in demo deployments; the public demo uses synthetic data only. Vercel Hobby is non-commercial, so Stripe remains in test mode.
