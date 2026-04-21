-- insert_log_uuid_standardize.sql
-- Purpose:
-- 1) Inspect existing public.insert_log overloads + COALESCE expressions.
-- 2) Remove legacy/duplicate overloads.
-- 3) Recreate a single canonical UUID-based function aligned to public.logs.

-- ---------------------------------------------------------------------------
-- 0) Diagnostics (run first; keep output for audit history)
-- ---------------------------------------------------------------------------
-- List all overloads.
select
  p.oid,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'insert_log'
order by p.oid;

-- Show full definitions (so the exact offending COALESCE can be identified).
select
  p.oid,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'insert_log'
order by p.oid;

-- Optional: extract only COALESCE expressions from insert_log definitions.
with defs as (
  select
    p.oid,
    pg_get_function_identity_arguments(p.oid) as identity_args,
    pg_get_functiondef(p.oid) as function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'insert_log'
)
select
  d.oid,
  d.identity_args,
  m[1] as coalesce_expression
from defs d
cross join lateral regexp_matches(d.function_def, '(coalesce\\([^\\n;]*\\))', 'gi') as m;

-- ---------------------------------------------------------------------------
-- 1) Remove all existing insert_log overloads in public schema
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'insert_log'
  loop
    execute format('drop function if exists public.insert_log(%s);', r.identity_args);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) Canonical insert_log function (UUID identity fields only)
-- ---------------------------------------------------------------------------
create or replace function public.insert_log(
  p_user_id uuid,
  p_date date,
  p_category text,
  p_points integer,
  p_notes text,
  p_status text,
  p_source text,
  p_studio_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_created_by uuid;
  v_approved_by uuid;
  v_approved_at timestamptz;
  v_status text;
  v_log_id bigint;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;
  if p_studio_id is null then
    raise exception 'p_studio_id is required';
  end if;
  if p_date is null then
    raise exception 'p_date is required';
  end if;
  if nullif(trim(coalesce(p_category, '')), '') is null then
    raise exception 'p_category is required';
  end if;
  if p_points is null then
    raise exception 'p_points is required';
  end if;

  v_status := lower(trim(coalesce(p_status, 'pending')));
  if v_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid p_status: %', p_status;
  end if;

  -- UUID-only identity resolution.
  v_created_by := coalesce(v_actor_user_id, p_user_id);
  if v_status = 'approved' then
    v_approved_by := v_created_by;
    v_approved_at := now();
  else
    v_approved_by := null;
    v_approved_at := null;
  end if;

  insert into public.logs (
    "userId",
    date,
    category,
    points,
    notes,
    status,
    source,
    studio_id,
    created_by,
    approved_by,
    approved_at
  )
  values (
    p_user_id,
    p_date,
    trim(lower(p_category)),
    p_points,
    coalesce(p_notes, ''),
    v_status,
    nullif(trim(coalesce(p_source, '')), ''),
    p_studio_id,
    v_created_by,
    v_approved_by,
    v_approved_at
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.insert_log(uuid, date, text, integer, text, text, text, uuid) from public;
grant execute on function public.insert_log(uuid, date, text, integer, text, text, text, uuid) to authenticated;
grant execute on function public.insert_log(uuid, date, text, integer, text, text, text, uuid) to service_role;

