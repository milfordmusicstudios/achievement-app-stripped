-- teacher_challenges_staff_rpc.sql
-- Staff-scoped list/update/delete RPCs for teacher challenges.

create or replace function public.list_teacher_challenges_for_staff(p_studio_id uuid)
returns table (
  id uuid,
  studio_id uuid,
  created_by uuid,
  title text,
  description text,
  points int,
  start_date date,
  end_date date,
  created_at timestamptz,
  assignment_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_teacher boolean := false;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  v_is_admin := public.has_any_studio_role(
    p_studio_id,
    v_caller_id,
    array['admin']::text[]
  );
  v_is_teacher := public.has_any_studio_role(
    p_studio_id,
    v_caller_id,
    array['teacher']::text[]
  );

  if not v_is_admin and not v_is_teacher then
    raise exception 'Caller is not staff in studio %', p_studio_id;
  end if;

  return query
  select
    c.id,
    c.studio_id,
    c.created_by,
    c.title,
    c.description,
    c.points,
    c.start_date,
    c.end_date,
    c.created_at,
    coalesce(a.assignment_count, 0)::bigint as assignment_count
  from public.teacher_challenges c
  left join (
    select challenge_id, count(*)::bigint as assignment_count
    from public.teacher_challenge_assignments
    group by challenge_id
  ) a
    on a.challenge_id = c.id
  where c.studio_id = p_studio_id
    and (
      v_is_admin
      or c.created_by = v_caller_id
    )
  order by c.created_at desc;
end;
$$;

grant execute on function public.list_teacher_challenges_for_staff(uuid) to authenticated;

create or replace function public.update_teacher_challenge(
  p_challenge_id uuid,
  p_title text,
  p_description text,
  p_points int,
  p_start_date date,
  p_end_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_challenge record;
  v_is_admin boolean := false;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_start_date > p_end_date then
    raise exception 'start_date must be on or before end_date';
  end if;

  select c.*
  into v_challenge
  from public.teacher_challenges c
  where c.id = p_challenge_id;

  if not found then
    raise exception 'Challenge not found: %', p_challenge_id;
  end if;

  v_is_admin := public.has_any_studio_role(
    v_challenge.studio_id,
    v_caller_id,
    array['admin']::text[]
  );

  if not v_is_admin and v_challenge.created_by <> v_caller_id then
    raise exception 'Not allowed to update this challenge';
  end if;

  update public.teacher_challenges
  set
    title = p_title,
    description = p_description,
    points = p_points,
    start_date = p_start_date,
    end_date = p_end_date
  where id = p_challenge_id;
end;
$$;

grant execute on function public.update_teacher_challenge(uuid, text, text, int, date, date) to authenticated;

create or replace function public.delete_teacher_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_challenge record;
  v_is_admin boolean := false;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.*
  into v_challenge
  from public.teacher_challenges c
  where c.id = p_challenge_id;

  if not found then
    raise exception 'Challenge not found: %', p_challenge_id;
  end if;

  v_is_admin := public.has_any_studio_role(
    v_challenge.studio_id,
    v_caller_id,
    array['admin']::text[]
  );

  if not v_is_admin and v_challenge.created_by <> v_caller_id then
    raise exception 'Not allowed to delete this challenge';
  end if;

  delete from public.teacher_challenges
  where id = p_challenge_id;
end;
$$;

grant execute on function public.delete_teacher_challenge(uuid) to authenticated;
