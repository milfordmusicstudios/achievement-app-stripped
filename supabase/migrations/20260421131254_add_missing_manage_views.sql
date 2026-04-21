create or replace view public.v_manage_families as
select
  p.id,
  p.studio_id,
  p."firstName",
  p."lastName",
  p.email,
  p."avatarUrl",
  p.active,
  p.deactivated_at,
  p.deactivated_reason,
  count(s.id)::integer as student_count
from public.users p
join public.users s
  on s.parent_uuid = p.id
 and s.studio_id = p.studio_id
where 'student' = any (s.roles)
group by
  p.id,
  p.studio_id,
  p."firstName",
  p."lastName",
  p.email,
  p."avatarUrl",
  p.active,
  p.deactivated_at,
  p.deactivated_reason;

create or replace view public.v_manage_students as
select
  s.id,
  s.studio_id,
  s."firstName",
  s."lastName",
  s.email,
  s."avatarUrl",
  s.roles,
  s."teacherIds",
  s.instrument,
  s.active,
  s.points,
  s.level,
  s.parent_uuid,
  p."firstName" as parent_first_name,
  p."lastName" as parent_last_name,
  p.email as parent_email
from public.users s
left join public.users p
  on p.id = s.parent_uuid
where 'student' = any (s.roles);