create table if not exists public.user_celebration_state (
  studio_id uuid not null,
  user_id uuid not null,
  last_seen_badge_award_at timestamptz null,
  last_seen_level_award_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);

alter table public.user_celebration_state enable row level security;

drop policy if exists user_celebration_state_select_own_or_staff on public.user_celebration_state;
create policy user_celebration_state_select_own_or_staff
on public.user_celebration_state
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = user_celebration_state.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

drop policy if exists user_celebration_state_insert_own_or_staff on public.user_celebration_state;
create policy user_celebration_state_insert_own_or_staff
on public.user_celebration_state
for insert
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = user_celebration_state.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

drop policy if exists user_celebration_state_update_own_or_staff on public.user_celebration_state;
create policy user_celebration_state_update_own_or_staff
on public.user_celebration_state
for update
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = user_celebration_state.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = user_celebration_state.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);
