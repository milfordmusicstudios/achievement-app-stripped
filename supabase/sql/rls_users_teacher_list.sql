-- Allow studio members to read teacher rows for their studio.
-- Run in Supabase SQL editor as admin.
create policy "studio_members_can_list_teachers"
on public.users
for select
using (
  studio_id is not null
  and exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = users.studio_id
      and sm.user_id = auth.uid()
  )
);
