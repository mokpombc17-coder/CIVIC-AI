create table pre_session_rate_limits (
    identity_hash bytea not null,
    source_ip inet not null,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    window_started_at timestamptz not null default now(),
    blocked_until timestamptz,
    last_attempt_at timestamptz not null default now(),
    primary key(identity_hash, source_ip)
);

create index ix_pre_session_rate_limits_cleanup
    on pre_session_rate_limits(last_attempt_at);
