-- Prevent concurrent checkout requests from opening multiple active top-ups.
with ranked_pending as (
  select id,
         row_number() over (partition by user_id order by created_at desc) as row_number
  from public.topups
  where status = 'pending'
)
update public.topups as topup
set status = 'expired'
from ranked_pending
where topup.id = ranked_pending.id
  and ranked_pending.row_number > 1;

create unique index if not exists topups_one_pending_per_user
  on public.topups(user_id)
  where status = 'pending';