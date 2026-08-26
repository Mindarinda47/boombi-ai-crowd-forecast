insert into public.regions (slug, name_ko, area_name, region_type, display_x, display_y)
values
  ('songdo', '송도', '서구', 'tourism', 28, 82),
  ('osiria', '오시리아', '기장군', 'tourism', 86, 27),
  ('taejongdae', '태종대', '영도구', 'tourism', 44, 88),
  ('huinnyeoul', '흰여울문화마을', '영도구', 'tourism', 35, 78),
  ('igidae', '이기대·오륙도', '남구', 'tourism', 65, 63),
  ('deokcheon', '덕천', '북구', 'commercial', 37, 18),
  ('yeonsan', '연산', '연제구', 'transit', 53, 33),
  ('hadan', '하단', '사하구', 'commercial', 17, 68)
on conflict (slug) do update set
  name_ko = excluded.name_ko,
  area_name = excluded.area_name,
  region_type = excluded.region_type,
  display_x = excluded.display_x,
  display_y = excluded.display_y,
  active = true;
