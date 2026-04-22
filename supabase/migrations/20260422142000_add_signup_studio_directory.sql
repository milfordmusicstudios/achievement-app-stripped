create or replace function public.list_signup_studios()
returns table (
  id uuid,
  name text,
  slug text
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.slug
  from public.studios s
  order by s.name asc nulls last, s.slug asc nulls last;
$$;

revoke all on function public.list_signup_studios() from public;
grant execute on function public.list_signup_studios() to anon, authenticated;
