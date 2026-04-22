-- Make level-up notifications idempotent per recipient/studio/message.
-- The message includes the reached level, so this prevents repeated
-- "Student reached level X" rows for the same recipient and studio.

update public.notifications
set
  "userId" = coalesce("userId", user_id),
  user_id = coalesce(user_id, "userId")
where "userId" is distinct from coalesce("userId", user_id)
   or user_id is distinct from coalesce(user_id, "userId");

with ranked as (
  select
    id,
    row_number() over (
      partition by
        coalesce(user_id, "userId"),
        coalesce(studio_id, '00000000-0000-0000-0000-000000000000'::uuid),
        lower(coalesce(type, '')),
        message
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.notifications
  where lower(coalesce(type, '')) = 'level_up'
    and coalesce(user_id, "userId") is not null
)
delete from public.notifications n
using ranked r
where n.id = r.id
  and r.duplicate_rank > 1;

create unique index if not exists notifications_level_up_unique_message_idx
on public.notifications (
  (coalesce(user_id, "userId")),
  (coalesce(studio_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  message
)
where lower(coalesce(type, '')) = 'level_up'
  and coalesce(user_id, "userId") is not null;
