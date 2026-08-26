create extension if not exists pgcrypto;

create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ko text not null,
  area_name text not null,
  city text not null default 'Busan',
  region_type text not null check (region_type in ('commercial', 'tourism', 'transit', 'sports')),
  display_x numeric not null check (display_x between 0 and 100),
  display_y numeric not null check (display_y between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'archived')),
  title text not null,
  venue_name text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  source_url text,
  source_kind text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forecast_daily (
  region_id uuid not null references public.regions(id) on delete cascade,
  forecast_date date not null,
  peak_score numeric not null check (peak_score between 0 and 100),
  confidence_score numeric not null check (confidence_score between 0 and 100),
  confidence_level text not null check (confidence_level in ('low', 'medium', 'high')),
  peak_start_at time not null,
  peak_end_at time not null,
  recommended_start_at time not null,
  recommended_end_at time not null,
  top_factors jsonb not null default '[]'::jsonb,
  weather_label text not null,
  event_title text not null,
  event_meta text not null,
  score_components jsonb not null default '{}'::jsonb,
  algorithm_version text not null default 'forecast-v1.0.0',
  generated_at timestamptz not null default now(),
  primary key (region_id, forecast_date)
);

create table if not exists public.forecast_slots (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  starts_at timestamptz not null,
  score numeric not null check (score between 0 and 100),
  risk_level text not null check (risk_level in ('calm', 'normal', 'busy', 'very_busy', 'extreme')),
  score_components jsonb not null default '{}'::jsonb,
  algorithm_version text not null default 'forecast-v1.0.0',
  generated_at timestamptz not null default now(),
  unique (region_id, starts_at, algorithm_version)
);

create index if not exists events_region_time_idx on public.events(region_id, start_at, end_at);
create index if not exists forecast_daily_date_idx on public.forecast_daily(forecast_date);
create index if not exists forecast_slots_region_time_idx on public.forecast_slots(region_id, starts_at);

alter table public.regions enable row level security;
alter table public.events enable row level security;
alter table public.forecast_daily enable row level security;
alter table public.forecast_slots enable row level security;

drop policy if exists "public read active regions" on public.regions;
create policy "public read active regions" on public.regions for select to anon, authenticated using (active = true);
drop policy if exists "public read approved events" on public.events;
create policy "public read approved events" on public.events for select to anon, authenticated using (status = 'approved');
drop policy if exists "public read daily forecasts" on public.forecast_daily;
create policy "public read daily forecasts" on public.forecast_daily for select to anon, authenticated using (true);
drop policy if exists "public read forecast slots" on public.forecast_slots;
create policy "public read forecast slots" on public.forecast_slots for select to anon, authenticated using (true);

insert into public.regions (slug, name_ko, area_name, region_type, display_x, display_y)
values
  ('seomyeon', '서면', '부산진구', 'commercial', 46, 47),
  ('haeundae', '해운대', '해운대구', 'tourism', 78, 37),
  ('gwangalli', '광안리', '수영구', 'tourism', 68, 52),
  ('centum', '센텀', '해운대구', 'commercial', 70, 41),
  ('sajik', '사직', '동래구', 'sports', 52, 29),
  ('busan-station', '부산역', '동구', 'transit', 37, 64),
  ('nampo', '남포', '중구', 'commercial', 28, 72),
  ('gijang', '기장', '기장군', 'tourism', 87, 18)
on conflict (slug) do update set
  name_ko = excluded.name_ko,
  area_name = excluded.area_name,
  region_type = excluded.region_type,
  display_x = excluded.display_x,
  display_y = excluded.display_y,
  active = true;

with region_seed as (
  select id, slug,
    case slug when 'seomyeon' then 94 when 'haeundae' then 78 when 'gwangalli' then 73 when 'centum' then 67
      when 'sajik' then 62 when 'busan-station' then 55 when 'nampo' then 48 else 39 end as base_score,
    case slug when 'seomyeon' then 86 when 'haeundae' then 81 when 'gwangalli' then 77 when 'centum' then 84
      when 'sajik' then 79 when 'busan-station' then 72 when 'nampo' then 74 else 68 end as confidence,
    case slug when 'seomyeon' then '흐림 28°' when 'haeundae' then '구름 많음 27°' when 'gwangalli' then '약한 비 26°'
      when 'centum' then '비 26°' when 'sajik' then '흐림 27°' when 'gijang' then '약한 비 25°' else '흐림 28°' end as weather_label,
    case slug when 'seomyeon' then '대형 캐릭터 팝업 스토어' when 'haeundae' then '해변 문화 체험 행사'
      when 'gwangalli' then '광안리 어쿠스틱 라이브' when 'centum' then '미래 모빌리티 특별전'
      when 'sajik' then '부산 홈경기' when 'busan-station' then '유라시아 시민 광장 마켓'
      when 'nampo' then '원도심 골목 문화 주간' else '해안 산책 프로그램' end as event_title
  from public.regions where active = true
), day_seed as (
  select generate_series(0, 7) as day_offset,
    timezone('Asia/Seoul', now())::date as seoul_today
)
insert into public.forecast_daily (
  region_id, forecast_date, peak_score, confidence_score, confidence_level,
  peak_start_at, peak_end_at, recommended_start_at, recommended_end_at,
  top_factors, weather_label, event_title, event_meta, score_components
)
select
  r.id,
  d.seoul_today + d.day_offset,
  greatest(0, least(100, r.base_score + (array[0,-8,-13,-6,5,-2,7,-4])[d.day_offset + 1])),
  r.confidence,
  case when r.confidence >= 75 then 'high' else 'medium' end,
  case when r.slug = 'seomyeon' then time '11:00' when r.slug = 'gwangalli' then time '17:00' else time '13:00' end,
  case when r.slug = 'seomyeon' then time '17:00' when r.slug = 'gwangalli' then time '21:00' else time '17:00' end,
  case when r.slug = 'seomyeon' then time '19:00' else time '09:00' end,
  case when r.slug = 'seomyeon' then time '21:00' else time '11:00' end,
  case when r.slug = 'seomyeon' then '["한정 상품·선착순 판매","검색 관심도 상승","주말 상권 수요 중첩"]'::jsonb
    when r.slug = 'centum' then '["실내 전시 관람객","비로 인한 실내 수요 이동","쇼핑 시간대 중첩"]'::jsonb
    else '["평소 유동 패턴","행사 방문 수요","날씨 보정"]'::jsonb end,
  r.weather_label,
  r.event_title,
  '공식 출처 확인 · 시범 시드 데이터',
  jsonb_build_object('baseline', 22, 'eventImpact', 28, 'trend', 15, 'calendar', 11, 'weatherAdjustment', 2, 'nearbyEventAdjustment', 3)
from region_seed r cross join day_seed d
on conflict (region_id, forecast_date) do update set
  peak_score = excluded.peak_score,
  confidence_score = excluded.confidence_score,
  confidence_level = excluded.confidence_level,
  top_factors = excluded.top_factors,
  weather_label = excluded.weather_label,
  event_title = excluded.event_title,
  event_meta = excluded.event_meta,
  score_components = excluded.score_components,
  generated_at = now();

insert into public.forecast_slots (region_id, starts_at, score, risk_level, score_components)
select
  d.region_id,
  (d.forecast_date::timestamp + make_interval(hours => h.hour_value)) at time zone 'Asia/Seoul',
  greatest(0, least(100, round(d.peak_score - abs(h.hour_value - 14) * 4 + case when h.hour_value between 11 and 17 then 5 else 0 end))),
  case
    when greatest(0, least(100, d.peak_score - abs(h.hour_value - 14) * 4 + case when h.hour_value between 11 and 17 then 5 else 0 end)) >= 90 then 'extreme'
    when greatest(0, least(100, d.peak_score - abs(h.hour_value - 14) * 4 + case when h.hour_value between 11 and 17 then 5 else 0 end)) >= 75 then 'very_busy'
    when greatest(0, least(100, d.peak_score - abs(h.hour_value - 14) * 4 + case when h.hour_value between 11 and 17 then 5 else 0 end)) >= 55 then 'busy'
    when greatest(0, least(100, d.peak_score - abs(h.hour_value - 14) * 4 + case when h.hour_value between 11 and 17 then 5 else 0 end)) >= 35 then 'normal'
    else 'calm'
  end,
  d.score_components
from public.forecast_daily d
cross join generate_series(8, 20) as h(hour_value)
where d.forecast_date between timezone('Asia/Seoul', now())::date and timezone('Asia/Seoul', now())::date + 7
on conflict (region_id, starts_at, algorithm_version) do update set
  score = excluded.score,
  risk_level = excluded.risk_level,
  score_components = excluded.score_components,
  generated_at = now();
