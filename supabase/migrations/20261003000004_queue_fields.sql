-- Fields for approval-queue actions that the first schema pass left out.
-- Grants on these tables are table-level, so new columns inherit them.

alter table public.touches
  add column snoozed_until timestamptz,
  add column reject_reason text check (reject_reason is null or char_length(reject_reason) <= 500);

comment on column public.touches.snoozed_until is
  'When set and in the future, the draft is hidden from the queue and the cadence waits.';
comment on column public.touches.reject_reason is
  'Owner-supplied reason when a draft is rejected; fed back into future prompts.';

alter table public.customers
  add column contact_flag text not null default 'none'
    check (contact_flag in ('none', 'wrong_contact', 'bounced', 'unsubscribed'));

comment on column public.customers.contact_flag is
  'Set by reply handling: wrong_contact pauses chasing until the owner fixes the email.';

create index touches_snoozed_idx on public.touches (org_id, snoozed_until)
  where status = 'draft' and snoozed_until is not null;
