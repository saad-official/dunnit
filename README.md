# Dunnit

**Invoices chased, politely.** An accounts-receivable agent for owner-operators: it plans reminder cadences, drafts each email in your voice, waits for your approval (or sends on its own once you trust it), reads the replies, and keeps the books straight.

Part of the [Vibe Build Series](https://github.com/saad-official/vibe-build-series): real products for small businesses, built in public on free tiers.

## Why

59% of small businesses carry invoices more than 30 days overdue (QuickBooks Late Payments Report, 2026). The reminders built into accounting tools are fixed templates. They cannot tell "we'll pay on the 15th" from "this invoice is wrong", so owners either chase by hand or stop chasing.

## What it does

- **Cadence planner** schedules four touches per invoice (friendly, firm, formal, final) relative to the due date, adjusted by customer risk and your send window.
- **Draft writer** produces each email from the invoice, the history, and your voice settings. Guardrails check it before you ever see it.
- **Approval queue** shows the proposal, the rationale, and a confidence score. Approve, edit, reject, or let step-one reminders go out on their own.
- **Reply reading** classifies incoming replies (paid, promise to pay, dispute, question, wrong contact, out of office, unsubscribe) and updates the invoice and cadence by deterministic rules.
- **Outcomes dashboard** reports dollars recovered after an agent touch, promise-kept rate, and days-sales-outstanding trend.
- **Audit trail** records every model call and every human decision in an append-only log.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Supabase (Postgres, Auth, pg_cron) · Vercel AI SDK 7 with Groq and Gemini · Stripe (test mode) · Resend · Vitest · Vercel

## Run it locally

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase, Groq/Gemini, Stripe test keys
pnpm dev
```

Database schema lives in `supabase/migrations`. Apply it with the Supabase CLI:

```bash
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push
```

## Docs

- [Product and technical spec](docs/spec.md)
- [Implementation plan](docs/plan.md)
- [Architecture decisions](docs/decisions/)

## Status

In active development. Demo mode delivers all email to the owner's own inbox; replies can be pasted or simulated in the Demo Inbox.
