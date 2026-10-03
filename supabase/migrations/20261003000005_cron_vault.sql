-- Hosted Supabase does not allow `alter database ... set app.settings.*`
-- (permission denied for the postgres role), so the tick job reads its URL
-- and bearer secret from Supabase Vault instead.
--
-- One-time setup per environment (run via `supabase db query --linked`, never commit values):
--   select vault.create_secret('https://<app-host>/api/cron/tick', 'dunnit_cron_url');
--   select vault.create_secret('<CRON_SECRET>', 'dunnit_cron_secret');
-- Rotate with: select vault.update_secret(id, '<new value>') from vault.secrets where name = '...';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dunnit-tick') then
    perform cron.unschedule('dunnit-tick');
  end if;
end $$;

select cron.schedule(
  'dunnit-tick',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'dunnit_cron_url' limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dunnit_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from vault.decrypted_secrets where name in ('dunnit_cron_url', 'dunnit_cron_secret') having count(*) = 2);
  $job$
);
