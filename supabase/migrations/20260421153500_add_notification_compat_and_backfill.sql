create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid,
  user_id uuid,
  title text,
  message text not null default '',
  type text,
  read boolean not null default false,
  studio_id uuid,
  created_by uuid,
  related_log_id uuid,
  recognition_given boolean not null default false,
  recognition_given_at timestamptz,
  recognition_given_by uuid,
  recognition_note text,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists "userId" uuid;
alter table public.notifications add column if not exists user_id uuid;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists message text not null default '';
alter table public.notifications add column if not exists type text;
alter table public.notifications add column if not exists read boolean not null default false;
alter table public.notifications add column if not exists studio_id uuid;
alter table public.notifications add column if not exists created_by uuid;
alter table public.notifications add column if not exists related_log_id uuid;
alter table public.notifications add column if not exists recognition_given boolean not null default false;
alter table public.notifications add column if not exists recognition_given_at timestamptz;
alter table public.notifications add column if not exists recognition_given_by uuid;
alter table public.notifications add column if not exists recognition_note text;
alter table public.notifications add column if not exists created_at timestamptz not null default now();

update public.notifications
set
  "userId" = coalesce("userId", user_id),
  user_id = coalesce(user_id, "userId")
where "userId" is distinct from coalesce("userId", user_id)
   or user_id is distinct from coalesce(user_id, "userId");

create or replace function public.sync_notification_user_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new."userId" is null and new.user_id is not null then
    new."userId" := new.user_id;
  end if;
  if new.user_id is null and new."userId" is not null then
    new.user_id := new."userId";
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_notification_user_columns on public.notifications;
create trigger trg_sync_notification_user_columns
before insert or update on public.notifications
for each row
execute function public.sync_notification_user_columns();

create index if not exists notifications_userid_created_idx
on public.notifications ("userId", created_at desc);

create index if not exists notifications_user_id_created_idx
on public.notifications (user_id, created_at desc);

create index if not exists notifications_studio_type_created_idx
on public.notifications (studio_id, type, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own_or_staff on public.notifications;
create policy notifications_select_own_or_staff
on public.notifications
for select
using (
  "userId" = auth.uid()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = notifications.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

drop policy if exists notifications_insert_own_or_staff on public.notifications;
create policy notifications_insert_own_or_staff
on public.notifications
for insert
with check (
  "userId" = auth.uid()
  or user_id = auth.uid()
  or created_by = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = notifications.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

drop policy if exists notifications_update_own_or_staff on public.notifications;
create policy notifications_update_own_or_staff
on public.notifications
for update
using (
  "userId" = auth.uid()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = notifications.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
)
with check (
  "userId" = auth.uid()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = notifications.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

create or replace function public.can_backfill_notifications_for_student(
  p_studio_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = p_user_id
    or exists (
      select 1
      from public.users u
      where u.id = p_user_id
        and u.parent_uuid = auth.uid()
        and u.studio_id = p_studio_id
    )
    or exists (
      select 1
      from public.studio_members sm
      where sm.studio_id = p_studio_id
        and sm.user_id = auth.uid()
        and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
    );
$$;

grant execute on function public.can_backfill_notifications_for_student(uuid, uuid) to authenticated;

create or replace function public.backfill_level_up_notifications_for_student(
  p_studio_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_points integer := 0;
  v_level_id integer := null;
  v_level_label text := null;
  v_student_name text := 'Student';
  v_teacher_ids text[] := array[]::text[];
  v_message text;
  v_inserted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_studio_id is null or p_user_id is null then
    raise exception 'Missing studio or user id';
  end if;

  if not public.can_backfill_notifications_for_student(p_studio_id, p_user_id) then
    raise exception 'Not allowed to backfill notifications for this student';
  end if;

  if not exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and sm.user_id = p_user_id
      and coalesce(sm.roles, '{}'::text[]) @> array['student']::text[]
  ) then
    raise exception 'Target user is not a student in this studio';
  end if;

  select
    trim(coalesce(u."firstName", '') || ' ' || coalesce(u."lastName", '')),
    coalesce(u."teacherIds", '{}'::text[])
  into v_student_name, v_teacher_ids
  from public.users u
  where u.id = p_user_id;

  v_student_name := coalesce(nullif(v_student_name, ''), 'Student');

  select coalesce(sum(coalesce(l.points, 0)), 0)::integer
  into v_total_points
  from public.logs l
  where l.studio_id = p_studio_id
    and l."userId" = p_user_id
    and lower(coalesce(l.status, '')) = 'approved';

  select lv.id, coalesce(lv.name, 'Level ' || lv.id::text)
  into v_level_id, v_level_label
  from public.levels lv
  where v_total_points >= coalesce(lv."minPoints", 0)
  order by coalesce(lv."minPoints", 0) desc
  limit 1;

  if v_level_id is null or v_level_id <= 1 then
    return jsonb_build_object(
      'ok', true,
      'studentUserId', p_user_id,
      'studioId', p_studio_id,
      'totalPoints', v_total_points,
      'level', v_level_id,
      'insertedNotifications', 0,
      'reason', 'student has not advanced beyond level 1'
    );
  end if;

  v_message := v_student_name || ' reached ' || v_level_label || '.';

  with recipient_ids as (
    select p_user_id as user_id
    union
    select sm.user_id
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and coalesce(sm.roles, '{}'::text[]) @> array['admin']::text[]
    union
    select sm.user_id
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and coalesce(sm.roles, '{}'::text[]) @> array['teacher']::text[]
      and sm.user_id::text = any (v_teacher_ids)
  ),
  inserted as (
    insert into public.notifications (
      "userId",
      user_id,
      title,
      message,
      type,
      read,
      studio_id,
      created_by
    )
    select
      r.user_id,
      r.user_id,
      'Level Up!',
      v_message,
      'level_up',
      false,
      p_studio_id,
      auth.uid()
    from recipient_ids r
    where r.user_id is not null
      and not exists (
        select 1
        from public.notifications n
        where (n."userId" = r.user_id or n.user_id = r.user_id)
          and n.studio_id = p_studio_id
          and lower(coalesce(n.type, '')) = 'level_up'
          and n.message = v_message
      )
    returning id
  )
  select count(*)::integer into v_inserted from inserted;

  return jsonb_build_object(
    'ok', true,
    'studentUserId', p_user_id,
    'studioId', p_studio_id,
    'totalPoints', v_total_points,
    'level', v_level_id,
    'levelLabel', v_level_label,
    'message', v_message,
    'insertedNotifications', v_inserted
  );
end;
$$;

grant execute on function public.backfill_level_up_notifications_for_student(uuid, uuid) to authenticated;

create or replace function public.backfill_level_up_notifications_for_studio(
  p_studio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student record;
  v_result jsonb;
  v_students integer := 0;
  v_inserted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_studio_id is null then
    raise exception 'Missing studio id';
  end if;

  if not exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  ) then
    raise exception 'Only studio teachers or admins can backfill studio notifications';
  end if;

  for v_student in
    select sm.user_id
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and coalesce(sm.roles, '{}'::text[]) @> array['student']::text[]
  loop
    v_students := v_students + 1;
    v_result := public.backfill_level_up_notifications_for_student(p_studio_id, v_student.user_id);
    v_inserted := v_inserted + coalesce((v_result->>'insertedNotifications')::integer, 0);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'studioId', p_studio_id,
    'studentsChecked', v_students,
    'insertedNotifications', v_inserted
  );
end;
$$;

grant execute on function public.backfill_level_up_notifications_for_studio(uuid) to authenticated;
