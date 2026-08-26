insert into public.regions (slug, name_ko, area_name, region_type, display_x, display_y)
values
  ('jeonpo', '전포', '부산진구', 'commercial', 48, 49),
  ('songjeong', '송정', '해운대구', 'tourism', 84, 34),
  ('yeongdo', '영도', '영도구', 'tourism', 40, 78),
  ('pnu', '부산대', '금정구', 'commercial', 55, 15),
  ('kyungsung', '경성대·부경대', '남구', 'commercial', 60, 55),
  ('dongnae', '동래', '동래구', 'commercial', 54, 23),
  ('dadaepo', '다대포', '사하구', 'tourism', 15, 83),
  ('gamcheon', '감천문화마을', '사하구', 'tourism', 24, 75)
on conflict (slug) do update set
  name_ko = excluded.name_ko,
  area_name = excluded.area_name,
  region_type = excluded.region_type,
  display_x = excluded.display_x,
  display_y = excluded.display_y,
  active = true;
