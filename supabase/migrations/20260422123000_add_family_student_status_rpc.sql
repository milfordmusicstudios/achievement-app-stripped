create or replace function public.set_family_student_active(
  p_student_id uuid,
  p_studio_id uuid,
  p_active boolean
)
returns table (
  id uuid,
  active boolean,
  deactivated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select exists (
    select 1
    from public.users u
    where u.id = p_student_id
      and u.studio_id = p_studio_id
      and u.id <> auth.uid()
      and 'student' = any (coalesce(u.roles, '{}'::text[]))
      and (
        u.parent_uuid = auth.uid()
        or exists (
          select 1
          from public.parent_student_links psl
          where psl.parent_id = auth.uid()
            and psl.student_id = u.id
            and psl.studio_id = p_studio_id
        )
        or exists (
          select 1
          from public.studios s
          where s.id = p_studio_id
            and s.account_holder_user_id = auth.uid()
        )
      )
  ) into v_allowed;

  if not v_allowed then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  update public.users u
  set
    active = coalesce(p_active, true),
    deactivated_at = case when coalesce(p_active, true) then null else now() end,
    deactivated_reason = case when coalesce(p_active, true) then null else u.deactivated_reason end
  where u.id = p_student_id
    and u.studio_id = p_studio_id
    and 'student' = any (coalesce(u.roles, '{}'::text[]))
  returning u.id, u.active, u.deactivated_at;
end;
$$;

revoke all on function public.set_family_student_active(uuid, uuid, boolean) from public;
grant execute on function public.set_family_student_active(uuid, uuid, boolean) to authenticated;
