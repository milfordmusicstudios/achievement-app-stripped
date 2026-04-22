create or replace function public.get_student_badge_catalog(
  p_studio_id uuid,
  p_user_id uuid
)
returns table (
  slug text,
  name text,
  family text,
  tier integer,
  sort_order integer,
  criteria jsonb,
  is_active boolean,
  earned_at timestamptz,
  last_earned_at timestamptz,
  stars integer,
  unlocked boolean
)
language sql
security definer
set search_path = public
as $$
  with allowed as (
    select exists (
      select 1
      from public.users u
      where u.id = p_user_id
        and u.studio_id = p_studio_id
        and (
          u.id = auth.uid()
          or u.parent_uuid = auth.uid()
          or exists (
            select 1
            from public.parent_student_links psl
            where psl.parent_id = auth.uid()
              and psl.student_id = u.id
              and psl.studio_id = p_studio_id
          )
          or exists (
            select 1
            from public.studio_members sm
            where sm.studio_id = p_studio_id
              and sm.user_id = auth.uid()
              and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher', 'owner']::text[]
          )
        )
    ) as ok
  )
  select
    bd.slug,
    bd.name,
    bd.family,
    bd.tier,
    bd.sort_order,
    bd.criteria,
    bd.is_active,
    ub.earned_at,
    ub.last_earned_at,
    coalesce(ub.stars, 0)::integer as stars,
    (ub.badge_slug is not null) as unlocked
  from public.badge_definitions bd
  cross join allowed a
  left join public.user_badges ub
    on ub.badge_slug = bd.slug
   and ub.user_id = p_user_id
   and ub.studio_id = p_studio_id
  where a.ok = true
    and bd.is_active = true
  order by bd.sort_order asc, bd.family asc, bd.tier asc, bd.slug asc;
$$;

revoke all on function public.get_student_badge_catalog(uuid, uuid) from public;
grant execute on function public.get_student_badge_catalog(uuid, uuid) to authenticated;

alter table public.user_badges enable row level security;
alter table public.user_badge_progress enable row level security;

drop policy if exists user_badges_select_own_family_or_staff on public.user_badges;
create policy user_badges_select_own_family_or_staff
on public.user_badges
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.users u
    where u.id = user_badges.user_id
      and u.studio_id = user_badges.studio_id
      and (
        u.parent_uuid = auth.uid()
        or exists (
          select 1
          from public.parent_student_links psl
          where psl.parent_id = auth.uid()
            and psl.student_id = u.id
            and psl.studio_id = user_badges.studio_id
        )
      )
  )
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = user_badges.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher', 'owner']::text[]
  )
);

drop policy if exists user_badge_progress_select_own_family_or_staff on public.user_badge_progress;
create policy user_badge_progress_select_own_family_or_staff
on public.user_badge_progress
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.users u
    where u.id = user_badge_progress.user_id
      and u.studio_id = user_badge_progress.studio_id
      and (
        u.parent_uuid = auth.uid()
        or exists (
          select 1
          from public.parent_student_links psl
          where psl.parent_id = auth.uid()
            and psl.student_id = u.id
            and psl.studio_id = user_badge_progress.studio_id
        )
      )
  )
  or exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = user_badge_progress.studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher', 'owner']::text[]
  )
);
