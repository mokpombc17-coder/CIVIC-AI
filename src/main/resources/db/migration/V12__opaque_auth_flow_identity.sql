create table opaque_auth_flows (
    flow_hash bytea primary key,
    identity_hash bytea not null,
    purpose varchar(64) not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index ix_opaque_auth_flows_expiry on opaque_auth_flows(expires_at);
