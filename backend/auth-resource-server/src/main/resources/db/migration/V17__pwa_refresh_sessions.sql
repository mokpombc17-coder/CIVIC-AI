create table pwa_refresh_sessions (
    id uuid primary key,
    family_id uuid not null unique,
    user_id uuid not null references users(id) on delete restrict,
    created_at timestamptz not null,
    last_used_at timestamptz not null,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    revocation_reason varchar(64),
    check (expires_at > created_at)
);

create table pwa_refresh_tokens (
    id uuid primary key,
    session_id uuid not null references pwa_refresh_sessions(id) on delete cascade,
    token_hash bytea not null unique,
    issued_at timestamptz not null,
    rotated_at timestamptz,
    replaced_by_id uuid references pwa_refresh_tokens(id) on delete restrict,
    revoked_at timestamptz,
    revocation_reason varchar(64)
);

create index ix_pwa_refresh_sessions_user_active
    on pwa_refresh_sessions(user_id, expires_at) where revoked_at is null;
create index ix_pwa_refresh_sessions_cleanup
    on pwa_refresh_sessions(expires_at, revoked_at);
create index ix_pwa_refresh_tokens_session
    on pwa_refresh_tokens(session_id);
