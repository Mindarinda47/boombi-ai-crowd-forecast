insert into public.regions (slug, name_ko, area_name, region_type, display_x, display_y)
values
  ('gimhae-airport', '김해공항', '강서구', 'transit', 7, 47),
  ('nopo', '노포·부산종합버스터미널', '금정구', 'transit', 59, 8),
  ('myeongji', '명지', '강서구', 'commercial', 7, 67),
  ('hwamyeong', '화명', '북구', 'commercial', 39, 12),
  ('munhyeon', '문현·BIFC', '남구', 'commercial', 49, 57),
  ('jangsan', '장산', '해운대구', 'commercial', 80, 35),
  ('ilgwang', '일광', '기장군', 'tourism', 90, 13),
  ('jeonggwan', '정관', '기장군', 'commercial', 78, 7)
on conflict (slug) do update set
  name_ko = excluded.name_ko,
  area_name = excluded.area_name,
  region_type = excluded.region_type,
  display_x = excluded.display_x,
  display_y = excluded.display_y,
  active = true;
