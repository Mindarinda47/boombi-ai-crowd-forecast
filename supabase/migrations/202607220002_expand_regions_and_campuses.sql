insert into public.regions (slug, name_ko, area_name, region_type, display_x, display_y)
values
  ('sasang', '사상', '사상구', 'transit', 20, 49),
  ('citizens-park', '부산시민공원', '부산진구', 'tourism', 44, 42),
  ('oncheonjang', '온천장', '동래구', 'commercial', 55, 20),
  ('cheongsapo', '청사포', '해운대구', 'tourism', 82, 43),
  ('eulsukdo', '을숙도', '사하구', 'tourism', 8, 72),
  ('dong-eui', '동의대', '부산진구', 'commercial', 36, 55),
  ('dongseo', '동서대', '사상구', 'commercial', 28, 53),
  ('silla', '신라대', '사상구', 'commercial', 23, 44),
  ('bufs', '부산외대', '금정구', 'commercial', 53, 8),
  ('kmou', '한국해양대', '영도구', 'commercial', 55, 81)
on conflict (slug) do update set
  name_ko = excluded.name_ko,
  area_name = excluded.area_name,
  region_type = excluded.region_type,
  display_x = excluded.display_x,
  display_y = excluded.display_y,
  active = true;

update public.regions
set name_ko = '하단·동아대', active = true
where slug = 'hadan';
