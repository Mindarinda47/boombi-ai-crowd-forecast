create table if not exists public.forecast_control_settings (
  id smallint primary key default 1 check (id = 1),
  auto_refresh_enabled boolean not null default false,
  ai_analysis_enabled boolean not null default false,
  ai_decision_enabled boolean not null default false,
  max_ai_analyses_per_run integer not null default 3 check (max_ai_analyses_per_run between 1 and 20),
  refresh_in_progress boolean not null default false,
  refresh_started_at timestamptz,
  refresh_trigger_source text check (refresh_trigger_source in ('manual', 'schedule')),
  last_manual_refresh_at timestamptz,
  last_schedule_refresh_at timestamptz,
  last_finished_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.forecast_control_settings enable row level security;

insert into public.forecast_control_settings (
  id,
  auto_refresh_enabled,
  ai_analysis_enabled,
  ai_decision_enabled,
  max_ai_analyses_per_run
)
values (1, false, false, false, 3)
on conflict (id) do nothing;

comment on table public.forecast_control_settings is
  '붐비 예보 자동 갱신과 외부 AI 사용 여부를 제어하는 단일 관리자 설정.';
