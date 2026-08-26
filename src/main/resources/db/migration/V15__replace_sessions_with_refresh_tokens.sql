drop table if exists sessions;

create table refresh_tokens (
    id uuid primary key,
    family_id uuid not null,
    token_hash bytea not null unique,
    user_id uuid not null references users(id) on delete restrict,
    expires_at timestamptz not null,
    family_expires_at timestamptz not null,
    issued_at timestamptz not null,
    last_used_at timestamptz not null,
    rotated_at timestamptz,
    replaced_by_id uuid references refresh_tokens(id) on delete restrict,
    revoked_at timestamptz,
    revocation_reason varchar(64),
    check (expires_at <= family_expires_at)
);

create index ix_refresh_tokens_user_active
    on refresh_tokens(user_id, expires_at) where revoked_at is null;
create index ix_refresh_tokens_family
    on refresh_tokens(family_id);
create index ix_refresh_tokens_cleanup
    on refresh_tokens(family_expires_at, revoked_at);
