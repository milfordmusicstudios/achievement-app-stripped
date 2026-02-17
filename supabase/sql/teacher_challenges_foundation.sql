-- teacher_challenges_foundation.sql
-- Backend foundation for Teacher Challenges (tables, RLS, RPC)

create extension if not exists pgcrypto;

-- Helper used by policies/RPC checks.
create or replace function public.has_any_studio_role(
  p_studio_id uuid,
  p_user_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and sm.user_id = p_user_id
      and coalesce(sm.roles, '{}'::text[]) && p_roles
  );
$$;

grant execute on function public.has_any_studio_role(uuid, uuid, text[]) to authenticated;

create table if not exists public.teacher_challenges (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  created_by uuid not null,
  created_by_role text not null check (created_by_role in ('admin', 'teacher')),
  title text not null,
  description text null,
  points int not null check (points >= 0),
  assignment_type text not null check (assignment_type in ('whole_studio', 'teacher_students', 'selected_students')),
  assignment_teacher_id uuid null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint teacher_challenges_date_check check (end_date >= start_date),
  constraint teacher_challenges_teacher_assignment_check check (
    (assignment_type = 'teacher_students' and assignment_teacher_id is not null)
    or (assignment_type <> 'teacher_students' and assignment_teacher_id is null)
  )
);

create index if not exists teacher_challenges_studio_created_idx
  on public.teacher_challenges (studio_id, created_at desc);

create index if not exists teacher_challenges_created_by_created_idx
  on public.teacher_challenges (created_by, created_at desc);

create table if not exists public.teacher_challenge_assignments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  challenge_id uuid not null references public.teacher_challenges(id) on delete cascade,
  student_id uuid not null,
  status text not null check (status in ('new', 'active', 'completed', 'dismissed')),
  accepted_at timestamptz null,
  completed_at timestamptz null,
  dismissed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint teacher_challenge_assignments_unique unique (challenge_id, student_id)
);

create index if not exists teacher_challenge_assignments_student_status_idx
  on public.teacher_challenge_assignments (student_id, status);

create index if not exists teacher_challenge_assignments_studio_student_idx
  on public.teacher_challenge_assignments (studio_id, student_id);

create index if not exists teacher_challenge_assignments_challenge_idx
  on public.teacher_challenge_assignments (challenge_id);

alter table public.teacher_challenges enable row level security;
alter table public.teacher_challenge_assignments enable row level security;

drop policy if exists teacher_challenges_select_staff on public.teacher_challenges;
create policy teacher_challenges_select_staff
on public.teacher_challenges
for select
using (
  public.has_any_studio_role(
    studio_id,
    auth.uid(),
    array['admin', 'teacher']::text[]
  )
);

drop policy if exists teacher_challenges_insert_staff on public.teacher_challenges;
create policy teacher_challenges_insert_staff
on public.teacher_challenges
for insert
with check (
  created_by = auth.uid()
  and created_by_role in ('admin', 'teacher')
  and public.has_any_studio_role(
    studio_id,
    auth.uid(),
    array['admin', 'teacher']::text[]
  )
);

drop policy if exists teacher_challenges_update_admin_only on public.teacher_challenges;
create policy teacher_challenges_update_admin_only
on public.teacher_challenges
for update
using (
  public.has_any_studio_role(studio_id, auth.uid(), array['admin']::text[])
)
with check (
  public.has_any_studio_role(studio_id, auth.uid(), array['admin']::text[])
);

drop policy if exists teacher_challenges_delete_admin_only on public.teacher_challenges;
create policy teacher_challenges_delete_admin_only
on public.teacher_challenges
for delete
using (
  public.has_any_studio_role(studio_id, auth.uid(), array['admin']::text[])
);

drop policy if exists teacher_challenge_assignments_select_staff on public.teacher_challenge_assignments;
create policy teacher_challenge_assignments_select_staff
on public.teacher_challenge_assignments
for select
using (
  public.has_any_studio_role(
    studio_id,
    auth.uid(),
    array['admin', 'teacher']::text[]
  )
);

drop policy if exists teacher_challenge_assignments_select_own on public.teacher_challenge_assignments;
create policy teacher_challenge_assignments_select_own
on public.teacher_challenge_assignments
for select
using (
  student_id = auth.uid()
);

-- No INSERT/UPDATE/DELETE policies on assignments on purpose.
-- Writes are expected to go through SECURITY DEFINER RPC.

create or replace function public.create_teacher_challenge(
  p_studio_id uuid,
  p_title text,
  p_description text,
  p_points int,
  p_assignment_type text,
  p_assignment_teacher_id uuid,
  p_selected_student_ids uuid[],
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_created_by_role text;
  v_challenge_id uuid;
  v_student_ids uuid[];
  v_selected_distinct_count int := 0;
  v_selected_valid_count int := 0;
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_end_date < p_start_date then
    raise exception 'end_date must be on or after start_date';
  end if;

  if p_assignment_type not in ('whole_studio', 'teacher_students', 'selected_students') then
    raise exception 'Invalid assignment_type: %', p_assignment_type;
  end if;

  if p_points < 0 then
    raise exception 'points must be >= 0';
  end if;

  if p_assignment_type = 'teacher_students' and p_assignment_teacher_id is null then
    raise exception 'assignment_teacher_id is required for teacher_students';
  end if;

  if p_assignment_type <> 'teacher_students' and p_assignment_teacher_id is not null then
    raise exception 'assignment_teacher_id must be null unless assignment_type=teacher_students';
  end if;

  if public.has_any_studio_role(p_studio_id, v_caller_id, array['admin']::text[]) then
    v_created_by_role := 'admin';
  elsif public.has_any_studio_role(p_studio_id, v_caller_id, array['teacher']::text[]) then
    v_created_by_role := 'teacher';
  else
    raise exception 'Caller is not admin/teacher in studio %', p_studio_id;
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
    end_date
  )
  values (
    p_studio_id,
    v_caller_id,
    v_created_by_role,
    p_title,
    p_description,
    p_points,
    p_assignment_type,
    p_assignment_teacher_id,
    p_start_date,
    p_end_date
  )
  returning id into v_challenge_id;

  if p_assignment_type = 'whole_studio' then
    select array_agg(distinct u.id)
    into v_student_ids
    from public.users u
    join public.studio_members sm
      on sm.user_id = u.id
     and sm.studio_id = p_studio_id
    where coalesce(u.active, true) = true
      and coalesce(sm.roles, '{}'::text[]) @> array['student']::text[];

  elsif p_assignment_type = 'teacher_students' then
    if not public.has_any_studio_role(p_studio_id, p_assignment_teacher_id, array['admin', 'teacher']::text[]) then
      raise exception 'assignment_teacher_id % is not teacher/admin in studio %', p_assignment_teacher_id, p_studio_id;
    end if;

    select array_agg(distinct u.id)
    into v_student_ids
    from public.users u
    join public.studio_members sm
      on sm.user_id = u.id
     and sm.studio_id = p_studio_id
    where coalesce(u.active, true) = true
      and coalesce(sm.roles, '{}'::text[]) @> array['student']::text[]
      and exists (
        select 1
        from unnest(coalesce(u."teacherIds"::text[], array[]::text[])) as tid
        where tid = p_assignment_teacher_id::text
      );

  else
    if p_selected_student_ids is null or coalesce(array_length(p_selected_student_ids, 1), 0) = 0 then
      raise exception 'selected_students requires p_selected_student_ids';
    end if;

    select count(distinct sid)
    into v_selected_distinct_count
    from unnest(p_selected_student_ids) as sid;

    select array_agg(distinct u.id), count(distinct u.id)
    into v_student_ids, v_selected_valid_count
    from public.users u
    join public.studio_members sm
      on sm.user_id = u.id
     and sm.studio_id = p_studio_id
    where u.id = any(p_selected_student_ids)
      and coalesce(u.active, true) = true
      and coalesce(sm.roles, '{}'::text[]) @> array['student']::text[];

    if v_selected_valid_count <> v_selected_distinct_count then
      raise exception 'One or more selected students are invalid for studio %', p_studio_id;
    end if;
  end if;

  if coalesce(array_length(v_student_ids, 1), 0) = 0 then
    raise exception 'Challenge assignment produced no students';
  end if;

  insert into public.teacher_challenge_assignments (
    studio_id,
    challenge_id,
    student_id,
    status
  )
  select
    p_studio_id,
    v_challenge_id,
    sid,
    'new'
  from unnest(v_student_ids) as sid;

  return v_challenge_id;
end;
$$;

grant execute on function public.create_teacher_challenge(
  uuid,
  text,
  text,
  int,
  text,
  uuid,
  uuid[],
  date,
  date
) to authenticated;

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
    c.start_date,
    c.end_date
  into v_assignment
  from public.teacher_challenge_assignments a
  join public.teacher_challenges c
    on c.id = a.challenge_id
  where a.id = p_assignment_id;

  if not found then
    raise exception 'Assignment not found: %', p_assignment_id;
  end if;

  if v_assignment.student_id <> v_caller_id then
    raise exception 'Only assigned student can update this assignment';
  end if;

  -- Completed no-op is always allowed.
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
