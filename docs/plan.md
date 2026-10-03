# Dunnit — implementation plan

Each phase ends with passing tests, a commit, and (from phase 3) a working deploy. Phases are small on purpose so that progress is visible commit by commit.

## Phase 0 — Foundation
- [x] Scaffold Next 16 + TypeScript + Tailwind 4 + pnpm
- [ ] Dependencies: Supabase, AI SDK (Groq, Gemini), Stripe, Resend, Zod, Vitest, shadcn/ui
- [ ] Design tokens (Fraunces + Inter, palette, dark mode) in `app/globals.css`
- [ ] `.env.example`, `README.md`, `docs/spec.md`, `docs/plan.md`
- [ ] GitHub repo `saad-official/dunnit`, CI workflow (lint, typecheck, test)

## Phase 1 — Domain core (pure TypeScript, TDD)
- [ ] `lib/domain/money.ts` — formatting, cents math
- [ ] `lib/domain/cadence.ts` — ladder, risk adjustment, send window, min gap, pause/resume
- [ ] `lib/domain/guardrails.ts` — draft validation, banned phrases, placeholder detection
- [ ] `lib/domain/replies.ts` — intent → actions state machine
- [ ] `lib/domain/metrics.ts` — recovered-after-touch, promise-kept rate, DSO
- [ ] `lib/domain/csv.ts` — invoice CSV parsing and validation

## Phase 2 — Data layer
- [ ] Supabase project (CLI), `supabase/migrations/0001_schema.sql` (tables, enums, indexes)
- [ ] `0002_rls.sql` (policies, helper `is_org_member`)
- [ ] `0003_cron.sql` (pg_cron + pg_net schedule for `/api/cron/tick`)
- [ ] Typed DB access in `lib/db/*` (server client, service client, queries)
- [ ] Seed: demo data generator (`lib/demo/seed.ts`)

## Phase 3 — Auth and app shell
- [ ] Supabase SSR clients, `proxy.ts`, sign in / sign up (email + password, confirmations off), org bootstrap on first login
- [ ] App layout: left rail, header, empty states
- [ ] Deploy to Vercel (preview), env vars

## Phase 4 — Invoices and customers
- [ ] Invoices list with status filters, detail page with timeline
- [ ] Manual add, CSV import, demo data button
- [ ] Customers list and detail (risk score, do-not-contact)

## Phase 5 — Agent loop
- [ ] `lib/ai/model.ts` (Groq primary, Gemini fallback), `lib/ai/log.ts` (agent_events)
- [ ] Draft writer prompt v1 + schema; guardrails wired
- [ ] Approval queue UI (approve / edit / reject / snooze, bulk)
- [ ] Email provider abstraction: Outbox + Resend demo mode; Outbox page
- [ ] `/api/cron/tick` and `/api/cron/daily`
- [ ] Reply classifier + Demo Inbox (paste or simulate) + `/api/inbound/email`
- [ ] Deterministic reply handling with escalation cards

## Phase 6 — Dashboard
- [ ] Metric tiles, DSO and recovered charts, activity timeline

## Phase 7 — Billing
- [ ] Stripe products/prices (sandbox), Checkout, Customer Portal, webhook handler, plan gating
- [ ] Billing page

## Phase 8 — Marketing and polish
- [ ] Landing page (hero, how it works, proof, pricing, FAQ), legal pages
- [ ] Settings: voice, autonomy, timezone, Stripe key (Pro)
- [ ] README with demo walkthrough and screenshots, Vercel Analytics, production deploy
