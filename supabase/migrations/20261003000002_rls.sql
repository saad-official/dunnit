-- Dunnit row level security, helper functions and grants.
--
-- Access model
--   * anon: no access to any table, view or helper function.
--   * authenticated: rows of orgs the caller is a member of (via memberships).
--   * service_role: used ONLY by server-side cron (/api/cron/*) and webhooks
--     (/api/stripe/webhook, /api/inbound/email) with SUPABASE_SECRET_KEY. It has
--     BYPASSRLS, so none of the policies below apply to it. That is why those code
--     paths must always scope their queries by org_id themselves. The append-only
--     trigger on agent_events still applies to service_role.
--
-- Policy style
--   * USING clauses use `org_id in (select public.current_org_ids())`: the sub-select
--     is evaluated once per statement (initPlan) and works with the org_id indexes.
--   * WITH CHECK clauses on insert/update use public.is_org_member(org_id) so a row
--     cannot be written into, or moved to, an org the caller does not belong to.
--   * Both helpers are SECURITY DEFINER so they can read memberships without
--     recursing through the memberships policy.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = org
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = (select auth.uid());
$$;

create or replace function public.is_org_owner(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = org
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.current_org_ids() from public, anon;
revoke all on function public.is_org_owner(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.current_org_ids() to authenticated, service_role;
grant execute on function public.is_org_owner(uuid) to authenticated, service_role;

-- set_updated_at / append-only functions are trigger functions; nobody calls them directly.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.agent_events_append_only() from public, anon, authenticated;
revoke all on function public.agent_events_no_truncate() from public, anon, authenticated;
revoke all on function public.handle_new_user() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants (minimal). Supabase's default privileges grant ALL on new public tables to
-- anon and authenticated; strip that and grant back only what each table needs.
-- RLS then narrows the rows.
-- ---------------------------------------------------------------------------

revoke all on
  public.organizations, public.memberships, public.customers, public.invoices,
  public.cadences, public.touches, public.replies, public.outbox, public.agent_events,
  public.invoice_overview
from public, anon, authenticated;

grant all on
  public.organizations, public.memberships, public.customers, public.invoices,
  public.cadences, public.touches, public.replies, public.outbox, public.agent_events,
  public.invoice_overview
to service_role;

-- organizations: read; update only the user-editable settings (column-level grant).
-- plan and stripe_* are written only by the Stripe webhook (service_role), so a
-- member cannot upgrade themselves to Pro through the API.
grant select on public.organizations to authenticated;
grant update (name, slug, timezone, voice, autonomy) on public.organizations to authenticated;

-- memberships: read only. Rows are created by handle_new_user() (security definer).
grant select on public.memberships to authenticated;

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update on public.cadences to authenticated;
grant select, insert, update on public.touches to authenticated;
grant select, insert, update on public.replies to authenticated;

-- outbox: written by the sending pipeline with service_role.
grant select on public.outbox to authenticated;

-- agent_events: append-only.
grant select, insert on public.agent_events to authenticated;

-- view: RLS of the underlying tables applies (security_invoker = true).
grant select on public.invoice_overview to authenticated;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create policy "members read their orgs"
  on public.organizations for select
  to authenticated
  using (id in (select public.current_org_ids()));

create policy "members update their orgs"
  on public.organizations for update
  to authenticated
  using (id in (select public.current_org_ids()))
  with check (public.is_org_member(id));

-- No insert policy: orgs are created by handle_new_user(). No delete policy:
-- account deletion is a service_role operation.

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------

create policy "members read memberships of their orgs"
  on public.memberships for select
  to authenticated
  using (org_id in (select public.current_org_ids()));

-- No insert/update/delete policies: only handle_new_user() (security definer)
-- and service_role write memberships.

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create policy "members read customers"
  on public.customers for select
  to authenticated
  using (org_id in (select public.current_org_ids()));

create policy "members insert customers"
  on public.customers for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy "members update customers"
  on public.customers for update
  to authenticated
  using (org_id in (select public.current_org_ids()))
  with check (public.is_org_member(org_id));

create policy "owners delete customers"
  on public.customers for delete
  to authenticated
  using (public.is_org_owner(org_id));

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------

create policy "members read invoices"
  on public.invoices for select
  to authenticated
  using (org_id in (select public.current_org_ids()));

create policy "members insert invoices"
  on public.invoices for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy "members update invoices"
  on public.invoices for update
  to authenticated
  using (org_id in (select public.current_org_ids()))
  with check (public.is_org_member(org_id));

create policy "owners delete invoices"
  on public.invoices for delete
  to authenticated
  using (public.is_org_owner(org_id));

-- ---------------------------------------------------------------------------
-- cadences
-- ---------------------------------------------------------------------------

create policy "members read cadences"
  on public.cadences for select
  to authenticated
  using (org_id in (select public.current_org_ids()));

create policy "members insert cadences"
  on public.cadences for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy "members update cadences"
  on public.cadences for update
  to authenticated
  using (org_id in (select public.current_org_ids()))
  with check (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- touches
-- ---------------------------------------------------------------------------

create policy "members read touches"
  on public.touches for select
  to authenticated
  using (org_id in (select public.current_org_ids()));

create policy "members insert touches"
  on public.touches for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy "members update touches"
  on public.touches for update
  to authenticated
  using (org_id in (select public.current_org_ids()))
  with check (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- replies
-- ---------------------------------------------------------------------------

create policy "members read replies"
  on public.replies for select
  to authenticated
  using (org_id in (select public.current_org_ids()));

create policy "members insert replies"
  on public.replies for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy "members update replies"
  on public.replies for update
  to authenticated
  using (org_id in (select public.current_org_ids()))
  with check (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- outbox (read only for members)
-- ---------------------------------------------------------------------------

create policy "members read outbox"
  on public.outbox for select
  to authenticated
  using (org_id in (select public.current_org_ids()));

-- ---------------------------------------------------------------------------
-- agent_events (select + insert; UPDATE/DELETE blocked for every role by trigger)
-- ---------------------------------------------------------------------------

create policy "members read agent events"
  on public.agent_events for select
  to authenticated
  using (org_id in (select public.current_org_ids()));

create policy "members append agent events"
  on public.agent_events for insert
  to authenticated
  with check (public.is_org_member(org_id));
