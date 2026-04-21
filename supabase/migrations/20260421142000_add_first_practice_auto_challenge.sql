alter table public.teacher_challenges
  add column if not exists automation_key text;

create unique index if not exists teacher_challenges_studio_automation_key_idx
on public.teacher_challenges (studio_id, automation_key)
where automation_key is not null;

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
begin
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_studio_id is null or p_student_id is null then
    raise exception 'Missing studio or student id';
  end if;

  if v_caller_id <> p_student_id then
    raise exception 'Only the signed-in student can initialize this challenge';
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

create or replace function public.complete_first_practice_challenge_on_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.category, '')) <> 'practice' then
    return new;
  end if;

  update public.teacher_challenge_assignments a
  set
    status = 'completed',
    completed_at = coalesce(a.completed_at, now())
  from public.teacher_challenges c
  where c.id = a.challenge_id
    and c.studio_id = new.studio_id
    and c.automation_key = 'first_practice'
    and a.student_id = new."userId"
    and a.status in ('new', 'active', 'dismissed');

  return new;
end;
$$;

drop trigger if exists trg_complete_first_practice_challenge_on_log on public.logs;
create trigger trg_complete_first_practice_challenge_on_log
after insert on public.logs
for each row
execute function public.complete_first_practice_challenge_on_log();
