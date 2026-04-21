-- =========================
-- BADGE DEFINITIONS (root)
-- =========================
create table if not exists public.badge_definitions (
  slug text primary key,
  name text not null,
  family text not null,
  tier integer not null default 1,
  sort_order integer not null default 1000,
  criteria jsonb not null default '{}'::jsonb,
  is_seasonal boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists badge_definitions_family_tier_idx
on public.badge_definitions (family, tier, sort_order, slug);


-- =========================
-- BADGE TABLES
-- =========================
create table if not exists public.badge_goal_completions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  goal_type text not null,
  status text not null default 'completed',
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists badge_goal_completions_user_idx
on public.badge_goal_completions (studio_id, user_id, status, completed_at desc);


create table if not exists public.badge_lesson_book_completions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  book_title text,
  status text not null default 'completed',
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists badge_lesson_book_completions_user_idx
on public.badge_lesson_book_completions (studio_id, user_id, status, completed_at desc);


create table if not exists public.badge_memberships (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now()
);

create index if not exists badge_memberships_user_idx
on public.badge_memberships (studio_id, user_id, start_date, end_date);


create table if not exists public.badge_proficiency_tests (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  test_type text not null,
  status text not null default 'completed',
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists badge_proficiency_tests_user_idx
on public.badge_proficiency_tests (studio_id, user_id, test_type, status, completed_at desc);


create table if not exists public.badge_streak_repairs (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  action text not null,
  approved boolean not null default false,
  protection_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists badge_streak_repairs_user_idx
on public.badge_streak_repairs (studio_id, user_id, action, approved, created_at desc);


-- =========================
-- USER BADGES
-- =========================
create table if not exists public.user_badge_progress (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  badge_slug text not null references public.badge_definitions(slug),
  season_year integer not null,
  season_key text not null,
  earned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, badge_slug, season_year)
);

create index if not exists user_badge_progress_studio_user_idx
on public.user_badge_progress (studio_id, user_id, badge_slug, season_year desc);


create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  user_id uuid not null,
  badge_slug text not null references public.badge_definitions(slug),
  earned_at timestamptz not null default now(),
  last_earned_at timestamptz not null default now(),
  stars integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, badge_slug)
);

create index if not exists user_badges_slug_idx
on public.user_badges (badge_slug);

create index if not exists user_badges_studio_user_idx
on public.user_badges (studio_id, user_id, earned_at desc);


-- =========================
-- RLS (READ ONLY)
-- =========================
alter table public.badge_definitions enable row level security;
create policy badge_definitions_read_all
on public.badge_definitions
for select
using (true);


-- repeat for others
alter table public.badge_goal_completions enable row level security;
create policy badge_goal_completions_select_own_or_staff
on public.badge_goal_completions
for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from studio_members sm
    where sm.studio_id = badge_goal_completions.studio_id
    and sm.user_id = auth.uid()
    and sm.roles && array['admin','teacher']
  )
);

-- (same pattern applies to the rest)


-- =========================
-- VIEWS
-- =========================
create or replace view public.teacher_students_view as
select id as student_id, studio_id, "firstName", "lastName", "avatarUrl",
instrument, points, level
from users s
where 'student' = any (roles)
and auth.uid()::text = any ("teacherIds");


create or replace view public.v_manage_staff as
select id, studio_id, "firstName", "lastName", email, "avatarUrl",
roles, active, deactivated_at, deactivated_reason
from users
where 'teacher' = any (roles);


create or replace view public.v_manage_users as
select sm.studio_id, u.id as user_id, u.email,
u."firstName", u."lastName", u."avatarUrl",
u.instrument, u.points, u.level, u.active,
u."teacherIds", sm.roles as membership_roles, u.roles as identity_roles
from studio_members sm
join users u on u.id = sm.user_id;