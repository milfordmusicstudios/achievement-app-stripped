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
    select distinct student_id as user_id
    from (
      select sm.user_id as student_id
      from public.studio_members sm
      where sm.studio_id = p_studio_id
        and coalesce(sm.roles, '{}'::text[]) @> array['student']::text[]

      union

      select u.id as student_id
      from public.users u
      where u.studio_id = p_studio_id
        and coalesce(u.roles, '{}'::text[]) @> array['student']::text[]
        and coalesce(u.active, true) = true
        and u.deactivated_at is null
    ) students
    where student_id is not null
  loop
    begin
      v_results := v_results || jsonb_build_array(public.recompute_badges_for_student(p_studio_id, v_student.user_id));
      v_count := v_count + 1;
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', false,
        'studioId', p_studio_id,
        'userId', v_student.user_id,
        'error', sqlerrm
      ));
    end;
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
