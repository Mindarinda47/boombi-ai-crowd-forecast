create table if not exists public.forecast_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null default 'refresh_forecast',
  trigger_source text not null default 'schedule',
  status text not null check (status in ('running', 'succeeded', 'failed')),
  forecast_dates integer not null default 0,
  regions_written integer not null default 0,
  public_events_applied integer not null default 0,
  source_status jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists forecast_job_runs_started_at_idx
  on public.forecast_job_runs(started_at desc);

alter table public.forecast_job_runs enable row level security;

comment on table public.forecast_job_runs is
  '07:00/19:00 KST 예보 자동 갱신의 최근 실행 결과. service_role만 기록한다.';
