-- 1. 아래 3개 값을 실제 값으로 바꾼 뒤 Supabase SQL Editor에서 한 번만 실행합니다.
-- 2. CRON_SHARED_SECRET은 Sites 런타임 환경변수와 같은 값을 사용합니다.
-- 3. SITES_BYPASS_TOKEN은 비공개 Sites 호출용이며 Supabase Vault에만 저장합니다.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select vault.create_secret(
  'https://YOUR-SITE-DOMAIN/api/internal/refresh-forecast',
  'boombi_forecast_refresh_url'
);
select vault.create_secret('REPLACE_WITH_CRON_SHARED_SECRET', 'boombi_cron_shared_secret');
select vault.create_secret('REPLACE_WITH_SITES_BYPASS_TOKEN', 'boombi_sites_bypass_token');

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
