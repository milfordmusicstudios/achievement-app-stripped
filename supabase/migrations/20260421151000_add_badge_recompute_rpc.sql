create or replace function public.can_recompute_badges_for_student(
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

grant execute on function public.can_recompute_badges_for_student(uuid, uuid) to authenticated;

create or replace function public.recompute_badges_for_student(
  p_studio_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_logs integer := 0;
  v_practice_logs integer := 0;
  v_participation_logs integer := 0;
  v_festival_participations integer := 0;
  v_performance_participations integer := 0;
  v_competition_participations integer := 0;
  v_goals_completed integer := 0;
  v_technique_completed integer := 0;
  v_theory_completed integer := 0;
  v_memorization_points integer := 0;
  v_lesson_books_completed integer := 0;
  v_teacher_challenges_completed integer := 0;
  v_streak_repair_earned integer := 0;
  v_streak_repair_used integer := 0;
  v_repair_protection_seen boolean := false;
  v_max_practice_streak integer := 0;
  v_has_early_bird boolean := false;
  v_has_night_owl boolean := false;
  v_has_comeback_kid boolean := false;
  v_has_multi_tasker boolean := false;
  v_has_power_week boolean := false;
  v_time_zone text := 'America/New_York';
  v_slugs text[] := array[]::text[];
  v_inserted_badges integer := 0;
  v_inserted_progress integer := 0;
  v_seasonal_badges integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_studio_id is null or p_user_id is null then
    raise exception 'Missing studio or user id';
  end if;

  if not public.can_recompute_badges_for_student(p_studio_id, p_user_id) then
    raise exception 'Not allowed to recompute badges for this student';
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

  select coalesce(s.settings->>'timezone', s.settings->>'timeZone', 'America/New_York')
  into v_time_zone
  from public.studios s
  where s.id = p_studio_id;

  with approved_logs as (
    select
      lower(trim(coalesce(l.category, ''))) as category,
      coalesce(l.notes, '') as notes,
      coalesce(l.points, 0)::integer as points,
      l.date::date as log_date,
      l.created_at
    from public.logs l
    where l.studio_id = p_studio_id
      and l."userId" = p_user_id
      and lower(coalesce(l.status, '')) = 'approved'
  )
  select
    count(*)::integer,
    (count(*) filter (where category = 'practice'))::integer,
    (count(*) filter (where category = 'participation'))::integer,
    (count(*) filter (where category = 'participation' and notes ~* 'competition'))::integer,
    (count(*) filter (where category = 'performance' and notes !~* '\\[outside performance\\]'))::integer,
    (count(*) filter (where category = 'proficiency' and notes ~* 'festival'))::integer,
    (count(*) filter (where category = 'proficiency' and notes ~* '(technique|level test)'))::integer,
    (count(*) filter (where category = 'proficiency' and notes ~* 'theory'))::integer,
    coalesce(sum(points) filter (where category = 'proficiency' and notes ~* 'memor'), 0)::integer,
    (count(*) filter (where category = 'proficiency' and notes ~* 'book' and points >= 50))::integer,
    bool_or(category = 'practice' and extract(hour from created_at at time zone v_time_zone) < 7),
    bool_or(category = 'practice' and extract(hour from created_at at time zone v_time_zone) >= 21)
  into
    v_total_logs,
    v_practice_logs,
    v_participation_logs,
    v_competition_participations,
    v_performance_participations,
    v_festival_participations,
    v_technique_completed,
    v_theory_completed,
    v_memorization_points,
    v_lesson_books_completed,
    v_has_early_bird,
    v_has_night_owl
  from approved_logs;

  v_has_early_bird := coalesce(v_has_early_bird, false);
  v_has_night_owl := coalesce(v_has_night_owl, false);

  select coalesce(max(streak_len), 0)::integer
  into v_max_practice_streak
  from (
    select count(*) as streak_len
    from (
      select d, d - (row_number() over (order by d))::integer as grp
      from (
        select distinct l.date::date as d
        from public.logs l
        where l.studio_id = p_studio_id
          and l."userId" = p_user_id
          and lower(coalesce(l.status, '')) = 'approved'
          and lower(trim(coalesce(l.category, ''))) = 'practice'
          and l.date is not null
      ) days
    ) grouped_days
    group by grp
  ) streaks;

  select coalesce(bool_or(d - previous_d >= 11), false)
  into v_has_comeback_kid
  from (
    select d, lag(d) over (order by d) as previous_d
    from (
      select distinct l.date::date as d
      from public.logs l
      where l.studio_id = p_studio_id
        and l."userId" = p_user_id
        and lower(coalesce(l.status, '')) = 'approved'
        and lower(trim(coalesce(l.category, ''))) = 'practice'
        and l.date is not null
    ) days
  ) gaps;

  select coalesce(bool_or(category_count >= 3), false)
  into v_has_multi_tasker
  from (
    select base.d, count(distinct lower(trim(coalesce(l.category, 'unknown')))) as category_count
    from (
      select distinct l.date::date as d
      from public.logs l
      where l.studio_id = p_studio_id
        and l."userId" = p_user_id
        and lower(coalesce(l.status, '')) = 'approved'
        and l.date is not null
    ) base
    join public.logs l
      on l.studio_id = p_studio_id
     and l."userId" = p_user_id
     and lower(coalesce(l.status, '')) = 'approved'
     and l.date::date between base.d and base.d + 6
    group by base.d
  ) rolling_categories;

  select coalesce(count(*) >= 2, false)
  into v_has_power_week
  from (
    select count(*) as streak_len
    from (
      select d, d - (row_number() over (order by d))::integer as grp
      from (
        select distinct l.date::date as d
        from public.logs l
        where l.studio_id = p_studio_id
          and l."userId" = p_user_id
          and lower(coalesce(l.status, '')) = 'approved'
          and lower(trim(coalesce(l.category, ''))) = 'practice'
          and l.date is not null
      ) days
    ) grouped_days
    group by grp
    having count(*) >= 7
  ) streak7;

  select v_goals_completed + count(*)::integer
  into v_goals_completed
  from public.badge_goal_completions bgc
  where bgc.studio_id = p_studio_id
    and bgc.user_id = p_user_id
    and lower(coalesce(bgc.status, '')) = 'completed';

  select v_goals_completed + count(*)::integer
  into v_goals_completed
  from public.logs l
  where l.studio_id = p_studio_id
    and l."userId" = p_user_id
    and lower(coalesce(l.status, '')) = 'approved'
    and lower(trim(coalesce(l.category, ''))) = 'personal';

  select
    v_technique_completed + (count(*) filter (where bpt.test_type = 'technique'))::integer,
    v_theory_completed + (count(*) filter (where bpt.test_type = 'theory'))::integer
  into v_technique_completed, v_theory_completed
  from public.badge_proficiency_tests bpt
  where bpt.studio_id = p_studio_id
    and bpt.user_id = p_user_id
    and lower(coalesce(bpt.status, '')) = 'completed';

  select v_lesson_books_completed + count(*)::integer
  into v_lesson_books_completed
  from public.badge_lesson_book_completions blbc
  where blbc.studio_id = p_studio_id
    and blbc.user_id = p_user_id
    and lower(coalesce(blbc.status, '')) = 'completed';

  select count(*)::integer
  into v_teacher_challenges_completed
  from public.teacher_challenge_assignments tca
  where tca.studio_id = p_studio_id
    and tca.student_id = p_user_id
    and lower(coalesce(tca.status, '')) = 'completed';

  select
    (count(*) filter (where bsr.action = 'earned'))::integer,
    (count(*) filter (where bsr.action = 'used'))::integer,
    coalesce(bool_or(bsr.protection_enabled), false)
  into v_streak_repair_earned, v_streak_repair_used, v_repair_protection_seen
  from public.badge_streak_repairs bsr
  where bsr.studio_id = p_studio_id
    and bsr.user_id = p_user_id
    and bsr.approved = true;

  v_slugs := array_cat(v_slugs, case when v_practice_logs >= 25 then array['practice_spark'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_practice_logs >= 100 then array['practice_groove'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_practice_logs >= 300 then array['practice_flow'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_practice_logs >= 800 then array['practice_mastery'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_max_practice_streak >= 3 then array['streak_spark'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_max_practice_streak >= 5 then array['streak_groove'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_max_practice_streak >= 7 then array['streak_rhythm'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_max_practice_streak >= 14 then array['streak_momentum'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_max_practice_streak >= 30 then array['streak_commitment'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_max_practice_streak >= 100 then array['streak_discipline'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_goals_completed >= 1 then array['personal_setter'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_goals_completed >= 5 then array['personal_chaser'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_goals_completed >= 10 then array['personal_crusher'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_goals_completed >= 20 then array['personal_directed'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_participation_logs >= 1 then array['participation_involved'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_participation_logs >= 5 then array['participation_player'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_participation_logs >= 15 then array['participation_regular'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_participation_logs >= 40 then array['participation_citizen'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when (v_technique_completed + v_theory_completed) >= 1 then array['proficiency_builder'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_technique_completed >= 3 then array['proficiency_focused'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_theory_completed >= 3 then array['proficiency_thinker'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_technique_completed >= 3 and v_theory_completed >= 3 and v_memorization_points >= 300 then array['proficiency_trained'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_festival_participations >= 1 then array['festival_debut'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_festival_participations >= 3 then array['festival_veteran'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_festival_participations >= 6 then array['festival_elite'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_performance_participations >= 1 then array['performance_stage'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_performance_participations >= 5 then array['performance_performer'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_performance_participations >= 15 then array['performance_presence'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_competition_participations >= 1 then array['competition_ready'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_competition_participations >= 5 then array['competition_edge'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_teacher_challenges_completed >= 1 then array['teacher_challenge'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_teacher_challenges_completed >= 5 then array['teacher_favorite'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_teacher_challenges_completed >= 10 then array['teacher_follower'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_memorization_points >= 250 then array['memory_master'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_lesson_books_completed >= 3 then array['book_finisher'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_total_logs >= 100 then array['logs_100'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_total_logs >= 500 then array['logs_500'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_total_logs >= 1000 then array['logs_1000'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_streak_repair_used >= 1 then array['repair_earned'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when (v_streak_repair_earned - v_streak_repair_used) >= 1 then array['repair_saved'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_streak_repair_used >= 1 and v_max_practice_streak >= 30 and v_repair_protection_seen then array['repair_preserved'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_has_early_bird then array['early_bird'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_has_night_owl then array['night_owl'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_has_comeback_kid then array['comeback_kid'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_has_multi_tasker then array['multi-tasker'] else array[]::text[] end);
  v_slugs := array_cat(v_slugs, case when v_has_power_week then array['power_week'] else array[]::text[] end);

  with qualifying_slugs as (
    select distinct unnest(v_slugs) as badge_slug
  ),
  inserted as (
    insert into public.user_badges (studio_id, user_id, badge_slug)
    select p_studio_id, p_user_id, qs.badge_slug
    from qualifying_slugs qs
    join public.badge_definitions bd
      on bd.slug = qs.badge_slug
     and bd.is_active = true
    on conflict (user_id, badge_slug) do nothing
    returning 1
  )
  select count(*)::integer into v_inserted_badges from inserted;

  with practice_days as (
    select distinct l.date::date as d
    from public.logs l
    where l.studio_id = p_studio_id
      and l."userId" = p_user_id
      and lower(coalesce(l.status, '')) = 'approved'
      and lower(trim(coalesce(l.category, ''))) = 'practice'
      and l.date is not null
  ),
  years as (
    select generate_series(extract(year from current_date)::integer - 6, extract(year from current_date)::integer + 1) as season_year
  ),
  windows as (
    select 'seasonal_summer'::text as badge_slug, season_year, make_date(season_year, 6, 1) as start_date, make_date(season_year, 8, 31) as end_date
    from years
    union all
    select 'seasonal_winter'::text as badge_slug, season_year, make_date(season_year - 1, 12, 1) as start_date, (make_date(season_year, 3, 1) - 1)::date as end_date
    from years
  ),
  week_counts as (
    select
      w.badge_slug,
      w.season_year,
      date_trunc('week', pd.d)::date as week_start,
      count(*) as practice_days
    from windows w
    join practice_days pd
      on pd.d between w.start_date and w.end_date
    group by w.badge_slug, w.season_year, date_trunc('week', pd.d)::date
  ),
  qualifying_seasons as (
    select badge_slug, season_year
    from week_counts
    where practice_days >= 2
    group by badge_slug, season_year
    having count(*) >= 5
  ),
  inserted_progress as (
    insert into public.user_badge_progress (
      studio_id,
      user_id,
      badge_slug,
      season_year,
      season_key
    )
    select
      p_studio_id,
      p_user_id,
      qs.badge_slug,
      qs.season_year,
      qs.badge_slug || ':' || qs.season_year::text
    from qualifying_seasons qs
    join public.badge_definitions bd
      on bd.slug = qs.badge_slug
     and bd.is_active = true
    on conflict (user_id, badge_slug, season_year) do nothing
    returning 1
  )
  select count(*)::integer into v_inserted_progress from inserted_progress;

  insert into public.user_badges (
    studio_id,
    user_id,
    badge_slug,
    stars,
    last_earned_at,
    updated_at
  )
  select
    p_studio_id,
    p_user_id,
    ubp.badge_slug,
    count(*)::integer,
    now(),
    now()
  from public.user_badge_progress ubp
  join public.badge_definitions bd
    on bd.slug = ubp.badge_slug
   and bd.is_active = true
  where ubp.studio_id = p_studio_id
    and ubp.user_id = p_user_id
    and ubp.badge_slug in ('seasonal_winter', 'seasonal_summer')
  group by ubp.badge_slug
  on conflict (user_id, badge_slug) do update set
    studio_id = excluded.studio_id,
    stars = greatest(user_badges.stars, excluded.stars),
    last_earned_at = case
      when excluded.stars > user_badges.stars then now()
      else user_badges.last_earned_at
    end,
    updated_at = now();

  get diagnostics v_seasonal_badges = row_count;

  return jsonb_build_object(
    'ok', true,
    'studioId', p_studio_id,
    'userId', p_user_id,
    'metrics', jsonb_build_object(
      'totalLogs', v_total_logs,
      'practiceLogs', v_practice_logs,
      'maxPracticeStreak', v_max_practice_streak,
      'participationLogs', v_participation_logs,
      'goalsCompleted', v_goals_completed,
      'techniqueCompleted', v_technique_completed,
      'theoryCompleted', v_theory_completed,
      'festivalParticipations', v_festival_participations,
      'performanceParticipations', v_performance_participations,
      'competitionParticipations', v_competition_participations,
      'memorizationPoints', v_memorization_points,
      'lessonBooksCompleted', v_lesson_books_completed,
      'teacherChallengesCompleted', v_teacher_challenges_completed,
      'streakRepairEarned', v_streak_repair_earned,
      'streakRepairUsed', v_streak_repair_used,
      'repairProtectionSeen', v_repair_protection_seen,
      'hasEarlyBird', v_has_early_bird,
      'hasNightOwl', v_has_night_owl,
      'hasComebackKid', v_has_comeback_kid,
      'hasMultiTasker', v_has_multi_tasker,
      'hasPowerWeek', v_has_power_week
    ),
    'insertedBadges', v_inserted_badges,
    'insertedSeasonalProgress', v_inserted_progress,
    'seasonalBadgesTouched', v_seasonal_badges
  );
end;
$$;

grant execute on function public.recompute_badges_for_student(uuid, uuid) to authenticated;

create or replace function public.recompute_badges_for_studio(p_studio_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student record;
  v_results jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and sm.user_id = auth.uid()
      and coalesce(sm.roles, '{}'::text[]) && array['admin', 'teacher']::text[]
  ) then
    raise exception 'Only studio staff can recompute badges for a studio';
  end if;

  for v_student in
    select sm.user_id
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and coalesce(sm.roles, '{}'::text[]) @> array['student']::text[]
  loop
    v_results := v_results || jsonb_build_array(public.recompute_badges_for_student(p_studio_id, v_student.user_id));
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'studioId', p_studio_id,
    'evaluatedUsers', v_count,
    'results', v_results
  );
end;
$$;

grant execute on function public.recompute_badges_for_studio(uuid) to authenticated;
