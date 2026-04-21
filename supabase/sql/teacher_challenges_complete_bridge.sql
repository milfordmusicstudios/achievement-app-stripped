-- teacher_challenges_complete_bridge.sql
-- Bridge RPC: mark challenge pending review + create normal pending log row.

alter table if exists public.teacher_challenge_assignments
  drop constraint if exists teacher_challenge_assignments_status_check;

alter table if exists public.teacher_challenge_assignments
  add constraint teacher_challenge_assignments_status_check
  check (status in ('new', 'active', 'pending_review', 'completed', 'dismissed'));

create or replace function public.complete_challenge_and_create_log(
  p_assignment_id uuid,
  p_student_id uuid,
  p_log_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_assignment record;
  v_is_self boolean := false;
  v_is_parent boolean := false;
  v_log_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_assignment_id is null or p_student_id is null then
    raise exception 'Missing assignment or student id';
  end if;

  v_is_self := (v_caller_id = p_student_id);
  select exists (
    select 1
    from public.users u
    where u.id = p_student_id
      and u.parent_uuid = v_caller_id
  )
  into v_is_parent;

  if not v_is_self and not v_is_parent then
    raise exception 'Not authorized for this student';
  end if;

  select
    a.id,
    a.student_id,
    a.status,
    a.studio_id,
    c.id as challenge_id,
    c.title,
    c.points,
    c.start_date,
    c.end_date
  into v_assignment
  from public.teacher_challenge_assignments a
  join public.teacher_challenges c
    on c.id = a.challenge_id
  where a.id = p_assignment_id
    and a.student_id = p_student_id
  for update;

  if not found then
    raise exception 'Assignment not found for student';
  end if;

  if v_assignment.status <> 'active' then
    raise exception 'Only active assignments can be completed';
  end if;

  if current_date > v_assignment.end_date then
    raise exception 'Challenge is past end_date';
  end if;

  update public.teacher_challenge_assignments
  set
    status = 'pending_review',
    completed_at = coalesce(completed_at, now())
  where id = p_assignment_id;

  insert into public.logs (
    "userId",
    points,
    notes,
    category,
    status,
    date,
    studio_id,
    created_by
  )
  values (
    p_student_id,
    coalesce(v_assignment.points, 0),
    'Teacher Challenge: ' || coalesce(v_assignment.title, 'Challenge'),
    'Teacher Challenge',
    'pending',
    coalesce(p_log_date, current_date),
    v_assignment.studio_id,
    v_caller_id
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.complete_challenge_and_create_log(uuid, uuid, date) to authenticated;
