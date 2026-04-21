-- validate_invite.sql
-- RPC to validate invite token without exposing invites table

create or replace function public.validate_invite_token(p_token text)
returns table (
  studio_id uuid,
  studio_name text,
  studio_slug text,
  invited_email text,
  role_hint text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    i.studio_id,
    s.name as studio_name,
    s.slug as studio_slug,
    i.invited_email,
    i.role_hint,
    i.expires_at
  from public.invites i
  join public.studios s on s.id = i.studio_id
  where i.token = p_token
    and i.status = 'pending'
    and (i.expires_at is null or i.expires_at > now())
  limit 1;
$$;

grant execute on function public.validate_invite_token(text) to anon, authenticated;
