-- Allow selected student profiles to use teacher challenges through the
-- same access paths as the rest of the app: self, family link, or staff.

drop policy if exists teacher_challenges_select_assigned_student_family on public.teacher_challenges;
create policy teacher_challenges_select_assigned_student_family
on public.teacher_challenges
for select
using (
  exists (
    select 1
    from public.teacher_challenge_assignments a
    where a.challenge_id = teacher_challenges.id
      and a.student_id = auth.uid()
  )
  or exists (
    select 1
    from public.teacher_challenge_assignments a
    join public.users u
      on u.id = a.student_id
    where a.challenge_id = teacher_challenges.id
      and u.parent_uuid = auth.uid()
  )
  or exists (
    select 1
    from public.teacher_challenge_assignments a
    join public.parent_student_links psl
      on psl.student_id = a.student_id
     and psl.studio_id = a.studio_id
    where a.challenge_id = teacher_challenges.id
      and psl.parent_id = auth.uid()
  )
);

drop policy if exists teacher_challenge_assignments_select_family on public.teacher_challenge_assignments;
create policy teacher_challenge_assignments_select_family
on public.teacher_challenge_assignments
for select
using (
  exists (
    select 1
    from public.users u
    where u.id = teacher_challenge_assignments.student_id
      and u.parent_uuid = auth.uid()
  )
  or exists (
    select 1
    from public.parent_student_links psl
    where psl.student_id = teacher_challenge_assignments.student_id
      and psl.parent_id = auth.uid()
      and psl.studio_id = teacher_challenge_assignments.studio_id
  )
);

create or replace function public.update_challenge_assignment_status(
  p_assignment_id uuid,
  p_new_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_assignment record;
  v_can_update boolean := false;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_new_status not in ('new', 'active', 'completed', 'dismissed') then
    raise exception 'Invalid status: %', p_new_status;
  end if;

  select
    a.id,
    a.student_id,
    a.status,
    a.accepted_at,
    a.completed_at,
    a.dismissed_at,
    a.studio_id,
    c.start_date,
    c.end_date
  into v_assignment
  from public.teacher_challenge_assignments a
  join public.teacher_challenges c
    on c.id = a.challenge_id
  where a.id = p_assignment_id
  for update;

  if not found then
    raise exception 'Assignment not found: %', p_assignment_id;
  end if;

  v_can_update := v_assignment.student_id = v_caller_id
    or public.has_any_studio_role(v_assignment.studio_id, v_caller_id, array['owner', 'admin', 'teacher']::text[])
    or exists (
      select 1
      from public.users u
      where u.id = v_assignment.student_id
        and u.parent_uuid = v_caller_id
    )
    or exists (
      select 1
      from public.parent_student_links psl
      where psl.student_id = v_assignment.student_id
        and psl.parent_id = v_caller_id
        and psl.studio_id = v_assignment.studio_id
    );

  if not v_can_update then
    raise exception 'Not authorized to update this assignment';
  end if;

  if p_new_status = v_assignment.status then
    if current_date > v_assignment.end_date and p_new_status <> 'completed' then
      raise exception 'Challenge is past end_date';
    end if;
    return;
  end if;

  if v_assignment.status = 'completed' then
    raise exception 'Completed assignments are terminal';
  end if;

  if current_date > v_assignment.end_date then
    raise exception 'Challenge is past end_date';
  end if;

  if current_date < v_assignment.start_date and p_new_status <> 'dismissed' then
    raise exception 'Challenge has not started';
  end if;

  if v_assignment.status = 'new' then
    if p_new_status not in ('active', 'dismissed') then
      raise exception 'Invalid transition: % -> %', v_assignment.status, p_new_status;
    end if;
  elsif v_assignment.status = 'active' then
    if p_new_status not in ('completed', 'dismissed') then
      raise exception 'Invalid transition: % -> %', v_assignment.status, p_new_status;
    end if;
  elsif v_assignment.status = 'dismissed' then
    if p_new_status <> 'new' then
      raise exception 'Invalid transition: % -> %', v_assignment.status, p_new_status;
    end if;
    if current_date < v_assignment.start_date or current_date > v_assignment.end_date then
      raise exception 'Cannot reactivate outside challenge window';
    end if;
  else
    raise exception 'Unsupported current status: %', v_assignment.status;
  end if;

  update public.teacher_challenge_assignments
  set
    status = p_new_status,
    accepted_at = case
      when p_new_status = 'active' then coalesce(accepted_at, now())
      else accepted_at
    end,
    completed_at = case
      when p_new_status = 'completed' then coalesce(completed_at, now())
      else completed_at
    end,
    dismissed_at = case
      when p_new_status = 'dismissed' then coalesce(dismissed_at, now())
      when v_assignment.status = 'dismissed' and p_new_status = 'new' then null
      else dismissed_at
    end
  where id = p_assignment_id;
end;
$$;

grant execute on function public.update_challenge_assignment_status(uuid, text) to authenticated;

drop function if exists public.complete_challenge_and_create_log(uuid, uuid, date);

create function public.complete_challenge_and_create_log(
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
  v_can_submit boolean := false;
  v_log_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_assignment_id is null or p_student_id is null then
    raise exception 'Missing assignment or student id';
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

  v_can_submit := v_caller_id = p_student_id
    or public.has_any_studio_role(v_assignment.studio_id, v_caller_id, array['owner', 'admin', 'teacher']::text[])
    or exists (
      select 1
      from public.users u
      where u.id = p_student_id
        and u.parent_uuid = v_caller_id
    )
    or exists (
      select 1
      from public.parent_student_links psl
      where psl.student_id = p_student_id
        and psl.parent_id = v_caller_id
        and psl.studio_id = v_assignment.studio_id
    );

  if not v_can_submit then
    raise exception 'Not authorized for this student';
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

create or replace function public.ensure_first_practice_challenge_assignment(
  p_studio_id uuid,
  p_student_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_challenge_id uuid;
  v_created_by uuid;
  v_created_by_role text;
  v_assignment_id uuid;
  v_can_initialize boolean := false;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_studio_id is null or p_student_id is null then
    raise exception 'Missing studio or student id';
  end if;

  v_can_initialize := v_caller_id = p_student_id
    or public.has_any_studio_role(p_studio_id, v_caller_id, array['owner', 'admin', 'teacher']::text[])
    or exists (
      select 1
      from public.users u
      where u.id = p_student_id
        and u.parent_uuid = v_caller_id
    )
    or exists (
      select 1
      from public.parent_student_links psl
      where psl.student_id = p_student_id
        and psl.parent_id = v_caller_id
        and psl.studio_id = p_studio_id
    );

  if not v_can_initialize then
    raise exception 'Not authorized for this student';
  end if;

  if not exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and sm.user_id = p_student_id
      and coalesce(sm.roles, '{}'::text[]) @> array['student']::text[]
  ) then
    raise exception 'Student is not a member of studio %', p_studio_id;
  end if;

  if exists (
    select 1
    from public.logs l
    where l.studio_id = p_studio_id
      and l."userId" = p_student_id
      and lower(coalesce(l.category, '')) = 'practice'
  ) then
    return null;
  end if;

  select sm.user_id,
    case
      when coalesce(sm.roles, '{}'::text[]) @> array['admin']::text[] then 'admin'
      else 'teacher'
    end
  into v_created_by, v_created_by_role
  from public.studio_members sm
  where sm.studio_id = p_studio_id
    and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  order by
    (coalesce(sm.roles, '{}'::text[]) @> array['admin']::text[]) desc,
    sm.user_id
  limit 1;

  if v_created_by is null then
    return null;
  end if;

  insert into public.teacher_challenges (
    studio_id,
    created_by,
    created_by_role,
    title,
    description,
    points,
    assignment_type,
    assignment_teacher_id,
    start_date,
    end_date,
    automation_key
  )
  values (
    p_studio_id,
    v_created_by,
    v_created_by_role,
    'Log your first practice',
    'Use the Quick Log Panel to log your practice and start earning points toward your next level.',
    0,
    'whole_studio',
    null,
    current_date,
    current_date + 3650,
    'first_practice'
  )
  on conflict (studio_id, automation_key)
  where automation_key is not null
  do update set
    title = excluded.title,
    description = excluded.description,
    points = excluded.points,
    end_date = greatest(teacher_challenges.end_date, excluded.end_date)
  returning id into v_challenge_id;

  insert into public.teacher_challenge_assignments (
    studio_id,
    challenge_id,
    student_id,
    status
  )
  values (
    p_studio_id,
    v_challenge_id,
    p_student_id,
    'new'
  )
  on conflict (challenge_id, student_id)
  do nothing
  returning id into v_assignment_id;

  return coalesce(v_assignment_id, (
    select a.id
    from public.teacher_challenge_assignments a
    where a.challenge_id = v_challenge_id
      and a.student_id = p_student_id
    limit 1
  ));
end;
$$;

grant execute on function public.ensure_first_practice_challenge_assignment(uuid, uuid) to authenticated;
