create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select cron.unschedule(jobid)
from cron.job
where jobname = 'boombi-refresh-forecast';

select cron.schedule(
  'boombi-refresh-forecast',
  '0 6,21 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'boombi_forecast_refresh_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'boombi_cron_shared_secret'),
      'OAI-Sites-Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'boombi_sites_bypass_token'),
      'x-refresh-trigger', 'schedule'
    ),
    body := '{}'::jsonb
  );
  $$
);

comment on table public.forecast_job_runs is
  '06:00/15:00 KST 날씨·검색·행사·혼잡 예보 통합 자동 갱신의 최근 실행 결과.';
