create or replace function public.create_family_student(
  p_studio_id uuid,
  p_first_name text,
  p_last_name text,
  p_instrument text[] default '{}'::text[],
  p_teacher_ids text[] default '{}'::text[]
)
returns table (
  id uuid,
  "firstName" text,
  "lastName" text,
  studio_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := gen_random_uuid();
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_first_name, '')), '') is null
    or nullif(trim(coalesce(p_last_name, '')), '') is null then
    raise exception 'student_name_required' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['parent', 'admin', 'teacher', 'owner']::text[]
  )
  or exists (
    select 1
    from public.studios s
    where s.id = p_studio_id
      and s.account_holder_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.users u
    where u.studio_id = p_studio_id
      and u.parent_uuid = auth.uid()
      and 'student' = any (coalesce(u.roles, '{}'::text[]))
  )
  or exists (
    select 1
    from public.parent_student_links psl
    where psl.studio_id = p_studio_id
      and psl.parent_id = auth.uid()
  )
  into v_allowed;

  if not v_allowed then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.users (
    id,
    "firstName",
    "lastName",
    roles,
    parent_uuid,
    instrument,
    "teacherIds",
    points,
    level,
    active,
    studio_id,
    showonleaderboard
  )
  values (
    v_student_id,
    trim(p_first_name),
    trim(p_last_name),
    array['student']::text[],
    auth.uid(),
    coalesce(p_instrument, '{}'::text[]),
    coalesce(p_teacher_ids, '{}'::text[]),
    0,
    1,
    true,
    p_studio_id,
    true
  );

  insert into public.parent_student_links (
    parent_id,
    student_id,
    studio_id
  )
  values (
    auth.uid(),
    v_student_id,
    p_studio_id
  )
  on conflict do nothing;

  return query
  select u.id, u."firstName", u."lastName", u.studio_id
  from public.users u
  where u.id = v_student_id;
end;
$$;

revoke all on function public.create_family_student(uuid, text, text, text[], text[]) from public;
grant execute on function public.create_family_student(uuid, text, text, text[], text[]) to authenticated;
