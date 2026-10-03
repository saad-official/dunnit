-- Dunnit background jobs (spec 3.9).
--
--   dunnit-tick       every 15 min: POST {cron_url} with Authorization: Bearer {cron_secret}
--                     (cron_url = https://<app>/api/cron/tick). The route uses the
--                     service role key and bypasses RLS.
--   dunnit-keepalive  daily no-op placeholder (`select 1`). The real keep-alive is the
--                     Vercel cron hitting /api/cron/daily, which queries Supabase.
--
-- Secrets are NOT baked into this migration or into cron.job. The job command reads
-- app.settings.cron_url / app.settings.cron_secret with current_setting() each time it
-- runs. The tick job is only scheduled when both settings exist, so this migration is
-- safe to apply to an environment that has not been configured yet (local, CI).
--
-- run once per environment (SQL editor, as postgres), then re-run the schedule block:
--
--   alter database postgres set app.settings.cron_url = 'https://<your-app>.vercel.app/api/cron/tick';
--   alter database postgres set app.settings.cron_secret = '<same value as CRON_SECRET>';
--
--   -- settings apply to NEW sessions only; open a new connection, then run the
--   -- do $$ ... $$ block below again to create the job.
--
-- cleanup:
--
--   select cron.unschedule('dunnit-tick');
--   select cron.unschedule('dunnit-keepalive');
--   alter database postgres reset app.settings.cron_url;
--   alter database postgres reset app.settings.cron_secret;
--
-- Inspect runs:  select * from cron.job_run_details order by start_time desc limit 20;
-- HTTP results:  select * from net._http_response order by created desc limit 20;

-- pg_cron's control file pins it to pg_catalog (relocatable = false, schema = pg_catalog);
-- `with schema extensions` would fail with "must be installed in schema pg_catalog".
-- It always creates its own `cron` schema for its tables and functions.
create extension if not exists pg_cron with schema pg_catalog;

-- pg_net creates its functions in the `net` schema regardless of the extension schema.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- dunnit-tick (conditional, idempotent: cron.schedule upserts by job name)
-- ---------------------------------------------------------------------------

do $$
declare
  v_url    text := nullif(current_setting('app.settings.cron_url', true), '');
  v_secret text := nullif(current_setting('app.settings.cron_secret', true), '');
begin
  if v_url is null or v_secret is null then
    raise notice 'dunnit-tick not scheduled: set app.settings.cron_url and app.settings.cron_secret, then re-run this block';
    return;
  end if;

  perform cron.schedule(
    'dunnit-tick',
    '*/15 * * * *',
    $cmd$
      select net.http_post(
        url := current_setting('app.settings.cron_url', true),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
        ),
        body := jsonb_build_object('job', 'dunnit-tick', 'scheduled_at', now()),
        timeout_milliseconds := 30000
      )
      where nullif(current_setting('app.settings.cron_url', true), '') is not null
        and nullif(current_setting('app.settings.cron_secret', true), '') is not null;
    $cmd$
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- dunnit-keepalive (unconditional no-op placeholder)
-- ---------------------------------------------------------------------------

select cron.schedule('dunnit-keepalive', '0 6 * * *', 'select 1');
