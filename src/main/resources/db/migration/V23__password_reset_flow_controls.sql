alter table auth_challenges add column verified_at timestamptz;

-- Opaque flows mirror real challenge state so failures cannot reveal whether an account exists.
alter table opaque_auth_flows
    add column attempt_count integer not null default 0 check (attempt_count >= 0),
    add column consumed_at timestamptz;

create table auth_challenge_send_limits (
    identity_hash bytea not null,
    purpose varchar(64) not null,
    last_sent_at timestamptz not null,
    window_started_at timestamptz not null,
    send_count integer not null check (send_count > 0),
    primary key (identity_hash, purpose)
);

create index ix_auth_challenge_send_limits_last_sent on auth_challenge_send_limits(last_sent_at);
