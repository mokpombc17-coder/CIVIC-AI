insert into account_state_outbox(user_id, account_state_version, state, event_payload)
select id, account_state_version, 'ACTIVE',
       jsonb_build_object('subject_id', id, 'version', account_state_version,
                          'state', 'ACTIVE', 'reason', 'ACTIVE_STATE_BACKFILL', 'at', now())
from users
where state = 'ACTIVE' and deleted_at is null
on conflict (user_id, account_state_version) do nothing;
