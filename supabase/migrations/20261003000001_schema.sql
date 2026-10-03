-- Dunnit schema (spec section 4).
--
-- Conventions
--   * uuid primary keys via gen_random_uuid(); created_at timestamptz not null default now().
--   * Every tenant table carries org_id. Child tables reference their parent with a
--     composite (id, org_id) foreign key so a row can never point at another org's row,
--     even if a caller supplies a foreign id (defence in depth on top of RLS).
--   * RLS is enabled here, immediately after each table is created, so no table ever
--     exists without it. Policies and grants live in 20261003000002_rls.sql.
--   * "overdue" is derived (due_at < today and status = 'open'), never stored.

-- ---------------------------------------------------------------------------
-- Enums (created before any table that uses them)
-- ---------------------------------------------------------------------------

create type public.plan as enum ('free', 'pro');

create type public.autonomy as enum ('manual', 'auto_step1', 'auto_all_low_risk');

-- open -> pending_verification -> paid
-- open -> disputed -> open | written_off
-- open -> paused (manual)
create type public.invoice_status as enum (
  'open', 'pending_verification', 'paid', 'disputed', 'written_off', 'paused'
);

-- active: planner will run it at next_run_at
-- paused: waiting for a reply to be handled or for paused_until to pass
-- stopped: halted for good (unsubscribe, paid, written off, manual stop)
-- completed: ladder exhausted (step 4 sent)
create type public.cadence_status as enum ('active', 'paused', 'stopped', 'completed');

-- draft: waiting in the approval queue
-- approved: approved (by a person or by auto-send), not yet handed to a provider
-- snoozed / rejected / cancelled: removed from the queue without sending
-- sent / failed: provider outcome
create type public.touch_status as enum (
  'draft', 'approved', 'snoozed', 'rejected', 'cancelled', 'sent', 'failed'
);

-- friendly/firm/formal/final map to ladder steps 1-4.
-- check_in: gentle follow-up after a promise_to_pay date passes.
-- reply: answer to a customer question.
create type public.touch_tone as enum ('friendly', 'firm', 'formal', 'final', 'check_in', 'reply');

create type public.reply_intent as enum (
  'paid', 'promise_to_pay', 'dispute', 'question',
  'wrong_contact', 'out_of_office', 'unsubscribe', 'other'
);

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create table public.organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (char_length(name) between 1 and 120),
  slug                   text not null unique
                           check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64),
  plan                   public.plan not null default 'free',
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  timezone               text not null default 'UTC',
  -- { business_name, signature, tone_notes }
  voice                  jsonb not null default '{}'::jsonb
                           check (jsonb_typeof(voice) = 'object'),
  autonomy               public.autonomy not null default 'manual',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.organizations enable row level security;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------

create table public.memberships (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.memberships enable row level security;

-- PK covers (org_id, user_id); RLS helpers look up by user_id first.
create index memberships_user_id_idx on public.memberships (user_id, org_id);

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 200),
  email          text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  company        text,
  risk_score     int not null default 0 check (risk_score between 0 and 100),
  do_not_contact boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- target for composite foreign keys from child tables
  unique (id, org_id)
);

alter table public.customers enable row level security;

create index customers_org_id_idx on public.customers (org_id);
create index customers_org_email_idx on public.customers (org_id, lower(email));

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------

create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  customer_id  uuid not null,
  number       text not null check (char_length(number) between 1 and 64),
  amount_cents bigint not null check (amount_cents >= 0),
  currency     text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  issued_at    date not null,
  due_at       date not null,
  status       public.invoice_status not null default 'open',
  source       text not null default 'manual' check (source in ('manual', 'csv', 'demo', 'stripe')),
  external_id  text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, number),
  -- Stripe sync upserts on this; multiple NULL external_ids are allowed.
  unique (org_id, source, external_id),
  check (due_at >= issued_at),
  check (status <> 'paid' or paid_at is not null),
  -- NO ACTION (not cascade): deleting a customer with invoices fails instead of
  -- silently wiping history. Org deletion still works because both rows go in
  -- the same statement and NO ACTION is checked at statement end.
  foreign key (customer_id, org_id) references public.customers (id, org_id)
);

alter table public.invoices enable row level security;

create index invoices_org_status_due_idx on public.invoices (org_id, status, due_at);
create index invoices_customer_id_idx on public.invoices (customer_id, org_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- cadences (one per invoice)
-- ---------------------------------------------------------------------------

create table public.cadences (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null unique,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  -- last ladder step sent: 0 = nothing sent yet, 1-4 = ladder steps
  step         int not null default 0 check (step between 0 and 4),
  next_run_at  timestamptz,
  status       public.cadence_status not null default 'active',
  paused_until timestamptz,
  pause_reason text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, org_id),
  foreign key (invoice_id, org_id) references public.invoices (id, org_id) on delete cascade
);

alter table public.cadences enable row level security;

create index cadences_org_id_idx on public.cadences (org_id);
-- cron tick: "active cadences due now" and "paused cadences whose pause expired"
create index cadences_status_next_run_idx on public.cadences (status, next_run_at);
create index cadences_status_paused_until_idx on public.cadences (status, paused_until)
  where status = 'paused';

create trigger cadences_set_updated_at
  before update on public.cadences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- touches (drafted / sent messages)
-- ---------------------------------------------------------------------------

create table public.touches (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  invoice_id          uuid not null,
  -- nullable: off-ladder touches (e.g. a reply to a question) may have no cadence
  cadence_id          uuid,
  -- 0 = off-ladder (check_in, reply), 1-4 = ladder step
  step                int not null check (step between 0 and 4),
  tone                public.touch_tone not null,
  subject             text not null,
  body                text not null,
  status              public.touch_status not null default 'draft',
  confidence          numeric(4, 3) not null default 0 check (confidence between 0 and 1),
  rationale           text,
  approved_by         uuid references auth.users (id) on delete set null,
  approved_at         timestamptz,
  sent_at             timestamptz,
  provider_message_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, org_id),
  check (status <> 'sent' or sent_at is not null),
  foreign key (invoice_id, org_id) references public.invoices (id, org_id) on delete cascade,
  foreign key (cadence_id, org_id) references public.cadences (id, org_id) on delete cascade
);

alter table public.touches enable row level security;

create index touches_org_status_idx on public.touches (org_id, status);
create index touches_invoice_created_idx on public.touches (invoice_id, created_at desc);
create index touches_cadence_id_idx on public.touches (cadence_id) where cadence_id is not null;
create index touches_approved_by_idx on public.touches (approved_by) where approved_by is not null;

create trigger touches_set_updated_at
  before update on public.touches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- replies (inbound, real or simulated)
-- ---------------------------------------------------------------------------

create table public.replies (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  invoice_id     uuid not null,
  touch_id       uuid,
  from_email     text not null,
  raw_text       text not null,
  received_at    timestamptz not null default now(),
  -- full LLM output: { intent, promise_date?, amount_cents?, summary, suggested_action, confidence }
  classification jsonb check (classification is null or jsonb_typeof(classification) = 'object'),
  -- denormalised copy of classification->>'intent' for filtering and metrics
  intent         public.reply_intent,
  handled        boolean not null default false,
  handled_at     timestamptz,
  simulated      boolean not null default false,
  created_at     timestamptz not null default now(),
  foreign key (invoice_id, org_id) references public.invoices (id, org_id) on delete cascade,
  -- keep the reply if its touch is deleted; only touch_id is nulled (PG15+ column list)
  foreign key (touch_id, org_id) references public.touches (id, org_id) on delete set null (touch_id)
);

alter table public.replies enable row level security;

create index replies_org_handled_idx on public.replies (org_id, handled);
create index replies_invoice_received_idx on public.replies (invoice_id, received_at desc);
create index replies_touch_id_idx on public.replies (touch_id) where touch_id is not null;

-- ---------------------------------------------------------------------------
-- outbox (rendered emails; the default EmailProvider)
-- ---------------------------------------------------------------------------

create table public.outbox (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  touch_id   uuid not null,
  to_email   text not null,
  subject    text not null,
  html       text,
  text       text not null,
  provider   text not null default 'outbox' check (provider in ('outbox', 'resend')),
  status     text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  created_at timestamptz not null default now(),
  foreign key (touch_id, org_id) references public.touches (id, org_id) on delete cascade
);

alter table public.outbox enable row level security;

create index outbox_org_created_idx on public.outbox (org_id, created_at desc);
create index outbox_touch_id_idx on public.outbox (touch_id);

-- ---------------------------------------------------------------------------
-- agent_events (append-only audit log)
-- ---------------------------------------------------------------------------

create table public.agent_events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  actor          text not null check (actor in ('agent', 'user', 'system', 'cron', 'webhook')),
  type           text not null check (char_length(type) between 1 and 100),
  entity_type    text,
  entity_id      uuid,
  input          jsonb,
  output         jsonb,
  model          text,
  prompt_version text,
  tokens_in      int check (tokens_in >= 0),
  tokens_out     int check (tokens_out >= 0),
  latency_ms     int check (latency_ms >= 0),
  created_at     timestamptz not null default now()
);

alter table public.agent_events enable row level security;

create index agent_events_org_created_idx on public.agent_events (org_id, created_at desc);
create index agent_events_entity_idx on public.agent_events (org_id, entity_type, entity_id, created_at desc)
  where entity_id is not null;

-- Rejects UPDATE always. Rejects DELETE unless the parent organization is already
-- gone, i.e. the delete is the ON DELETE CASCADE from deleting the whole org
-- (account deletion). This applies to every role, including service_role.
create or replace function public.agent_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and not exists (select 1 from public.organizations o where o.id = old.org_id) then
    return old;
  end if;
  raise exception 'agent_events is append-only (% rejected)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger agent_events_no_update_delete
  before update or delete on public.agent_events
  for each row execute function public.agent_events_append_only();

create or replace function public.agent_events_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'agent_events is append-only (TRUNCATE rejected)'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger agent_events_no_truncate
  before truncate on public.agent_events
  for each statement execute function public.agent_events_no_truncate();

-- ---------------------------------------------------------------------------
-- New-user bootstrap: one organization + owner membership per sign-up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text;
  v_base   text;
  v_slug   text;
  v_org_id uuid;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'business_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'My business'
  );
  v_name := left(v_name, 120);

  -- slugify: lowercase, non-alphanumerics -> '-', collapse, trim, cap length
  v_base := lower(v_name);
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  v_base := btrim(left(v_base, 48), '-');
  if v_base = '' then
    v_base := 'org';
  end if;

  v_slug := v_base;
  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end loop;

  insert into public.organizations (name, slug, voice)
  values (v_name, v_slug, jsonb_build_object('business_name', v_name))
  returning id into v_org_id;

  insert into public.memberships (org_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  return new;
end;
$$;

-- Trigger functions cannot be called through PostgREST, but keep EXECUTE closed anyway.
revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- invoice_overview: one row per invoice with customer, cadence and touch stats.
-- security_invoker = true makes the view run with the caller's privileges, so the
-- RLS policies on invoices/customers/cadences/touches apply and nothing leaks
-- across orgs. Without it the view would run as its owner (postgres) and bypass RLS.
-- ---------------------------------------------------------------------------

create view public.invoice_overview
with (security_invoker = true)
as
select
  i.id,
  i.org_id,
  i.customer_id,
  i.number,
  i.amount_cents,
  i.currency,
  i.issued_at,
  i.due_at,
  i.status,
  i.source,
  i.external_id,
  i.paid_at,
  i.created_at,
  i.updated_at,
  -- derived; uses the database's current_date (UTC on Supabase), not the org timezone
  (i.status = 'open' and i.due_at < current_date) as is_overdue,
  c.name                        as customer_name,
  c.email                       as customer_email,
  c.do_not_contact              as customer_do_not_contact,
  cd.id                         as cadence_id,
  cd.status                     as cadence_status,
  cd.step                       as cadence_step,
  cd.next_run_at,
  cd.paused_until,
  t.sent_touch_count,
  t.last_touch_at
from public.invoices i
join public.customers c
  on c.id = i.customer_id and c.org_id = i.org_id
left join public.cadences cd
  on cd.invoice_id = i.id and cd.org_id = i.org_id
left join lateral (
  select
    count(*)::int  as sent_touch_count,
    max(tt.sent_at) as last_touch_at
  from public.touches tt
  where tt.invoice_id = i.id
    and tt.org_id = i.org_id
    and tt.status = 'sent'
) t on true;
