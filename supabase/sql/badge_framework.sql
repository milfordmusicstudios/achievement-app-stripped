-- badge_framework.sql
-- Lifetime badge framework: definitions, awards, seasonal progress, and helper records.

create extension if not exists pgcrypto;

create table if not exists public.badge_definitions (
  slug text primary key,
  name text not null,
  family text not null,
  tier int not null default 1,
  sort_order int not null default 1000,
  criteria jsonb not null default '{}'::jsonb,
  is_seasonal boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists badge_definitions_family_tier_idx
  on public.badge_definitions (family, tier, sort_order, slug);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  badge_slug text not null references public.badge_definitions(slug) on delete cascade,
  earned_at timestamptz not null default now(),
  last_earned_at timestamptz not null default now(),
  stars int not null default 1 check (stars >= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_badges_unique_user_slug unique (user_id, badge_slug)
);

create index if not exists user_badges_studio_user_idx
  on public.user_badges (studio_id, user_id, earned_at desc);

create index if not exists user_badges_slug_idx
  on public.user_badges (badge_slug);

create table if not exists public.user_badge_progress (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  badge_slug text not null references public.badge_definitions(slug) on delete cascade,
  season_year int not null,
  season_key text not null,
  earned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_badge_progress_unique unique (user_id, badge_slug, season_year)
);

create index if not exists user_badge_progress_studio_user_idx
  on public.user_badge_progress (studio_id, user_id, badge_slug, season_year desc);

-- Optional helper records to support deterministic badge calculations when those records
-- are not represented directly in logs.
create table if not exists public.badge_goal_completions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  goal_type text not null check (goal_type in ('personal', 'teacher')),
  status text not null default 'completed' check (status in ('completed', 'dismissed')),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists badge_goal_completions_user_idx
  on public.badge_goal_completions (studio_id, user_id, status, completed_at desc);

create table if not exists public.badge_proficiency_tests (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  test_type text not null check (test_type in ('technique', 'theory')),
  status text not null default 'completed' check (status in ('completed', 'failed', 'pending')),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists badge_proficiency_tests_user_idx
  on public.badge_proficiency_tests (studio_id, user_id, test_type, status, completed_at desc);

create table if not exists public.badge_lesson_book_completions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  book_title text null,
  status text not null default 'completed' check (status in ('completed', 'pending')),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists badge_lesson_book_completions_user_idx
  on public.badge_lesson_book_completions (studio_id, user_id, status, completed_at desc);

create table if not exists public.badge_streak_repairs (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  action text not null check (action in ('earned', 'used')),
  approved boolean not null default false,
  protection_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists badge_streak_repairs_user_idx
  on public.badge_streak_repairs (studio_id, user_id, action, approved, created_at desc);

create table if not exists public.badge_memberships (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  start_date date not null,
  end_date date null,
  created_at timestamptz not null default now(),
  constraint badge_memberships_dates check (end_date is null or end_date >= start_date)
);

create index if not exists badge_memberships_user_idx
  on public.badge_memberships (studio_id, user_id, start_date, end_date);

-- Deterministic enforcement: one practice log per user/date in a studio.
create or replace function public.enforce_unique_daily_practice_log()
returns trigger
language plpgsql
as $$
declare
  v_exists boolean := false;
begin
  if lower(coalesce(new.category, '')) <> 'practice' then
    return new;
  end if;

  select exists (
    select 1
    from public.logs l
    where l.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and l.studio_id = new.studio_id
      and l."userId" = new."userId"
      and l.date = new.date
      and lower(coalesce(l.category, '')) = 'practice'
      and coalesce(l.status, '') <> 'rejected'
  )
  into v_exists;

  if v_exists then
    raise exception 'Practice log already exists for this user/date/studio';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_unique_daily_practice_log on public.logs;
create trigger trg_enforce_unique_daily_practice_log
before insert or update on public.logs
for each row
execute function public.enforce_unique_daily_practice_log();

alter table public.badge_definitions enable row level security;
alter table public.user_badges enable row level security;
alter table public.user_badge_progress enable row level security;
alter table public.badge_goal_completions enable row level security;
alter table public.badge_proficiency_tests enable row level security;
alter table public.badge_lesson_book_completions enable row level security;
alter table public.badge_streak_repairs enable row level security;
alter table public.badge_memberships enable row level security;

drop policy if exists badge_definitions_read_all on public.badge_definitions;
create policy badge_definitions_read_all
on public.badge_definitions
for select
using (true);

drop policy if exists user_badges_select_own_or_staff on public.user_badges;
create policy user_badges_select_own_or_staff
on public.user_badges
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = user_badges.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

drop policy if exists user_badge_progress_select_own_or_staff on public.user_badge_progress;
create policy user_badge_progress_select_own_or_staff
on public.user_badge_progress
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = user_badge_progress.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

drop policy if exists badge_goal_completions_select_own_or_staff on public.badge_goal_completions;
create policy badge_goal_completions_select_own_or_staff
on public.badge_goal_completions
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = badge_goal_completions.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

drop policy if exists badge_proficiency_tests_select_own_or_staff on public.badge_proficiency_tests;
create policy badge_proficiency_tests_select_own_or_staff
on public.badge_proficiency_tests
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = badge_proficiency_tests.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

drop policy if exists badge_lesson_book_completions_select_own_or_staff on public.badge_lesson_book_completions;
create policy badge_lesson_book_completions_select_own_or_staff
on public.badge_lesson_book_completions
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = badge_lesson_book_completions.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

drop policy if exists badge_streak_repairs_select_own_or_staff on public.badge_streak_repairs;
create policy badge_streak_repairs_select_own_or_staff
on public.badge_streak_repairs
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = badge_streak_repairs.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);

drop policy if exists badge_memberships_select_own_or_staff on public.badge_memberships;
create policy badge_memberships_select_own_or_staff
on public.badge_memberships
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = badge_memberships.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  )
);
