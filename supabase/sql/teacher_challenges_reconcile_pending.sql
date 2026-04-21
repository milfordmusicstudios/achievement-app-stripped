-- One-time reconciliation for challenge assignments stuck in pending_review
-- after their corresponding teacher challenge log was already approved.
--
-- Run this in Supabase SQL editor as a privileged role.

update public.teacher_challenge_assignments a
set
  status = 'completed',
  completed_at = coalesce(a.completed_at, now())
from public.teacher_challenges c
where a.challenge_id = c.id
  and a.status in ('pending_review', 'pending')
  and exists (
    select 1
    from public.logs l
    where l."userId" = a.student_id
      and l.studio_id = a.studio_id
      and lower(coalesce(l.status, '')) = 'approved'
      and (
        lower(coalesce(l.category, '')) = 'teacher challenge'
        or lower(coalesce(l.notes, '')) like 'teacher challenge:%'
      )
      and lower(coalesce(l.notes, '')) like ('teacher challenge: ' || lower(coalesce(c.title, '')) || '%')
  );
