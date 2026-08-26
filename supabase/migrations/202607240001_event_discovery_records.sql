create table if not exists public.event_discovery_records (
  source_key text primary key,
  content_hash text not null,
  candidate jsonb not null,
  analysis jsonb not null,
  decision_status text not null check (decision_status in ('auto_approved', 'needs_review', 'excluded')),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  analyzed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_discovery_records_last_seen_idx
  on public.event_discovery_records(last_seen_at desc);

create index if not exists event_discovery_records_decision_idx
  on public.event_discovery_records(decision_status, last_seen_at desc);

alter table public.event_discovery_records enable row level security;

comment on table public.event_discovery_records is
  '공공 API와 민간 행사 검색에서 발견한 후보의 원문 해시와 구조화 분석 결과. service_role만 기록·조회한다.';
