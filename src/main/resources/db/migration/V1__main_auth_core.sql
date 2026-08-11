create extension if not exists pgcrypto;

create table users (
    id uuid primary key default gen_random_uuid(),
    email varchar(320) not null,
    normalized_email varchar(320) not null unique,
    origin varchar(32) not null check (origin in ('SIGNUP', 'BOOTSTRAP_ADMIN', 'ADMIN_CREATED')),
    state varchar(32) not null check (state in ('PENDING_EMAIL_VERIFICATION', 'ACTIVE', 'DEACTIVATED', 'DELETED')),
    account_state_version bigint not null default 0 check (account_state_version >= 0),
    row_version bigint not null default 0 check (row_version >= 0),
    email_verified_at timestamptz,
    deactivated_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (normalized_email = lower(btrim(email)))
);

create table credentials (
    user_id uuid primary key references users(id) on delete restrict,
    password_hash text not null,
    must_change_password boolean not null default false,
    two_factor_enabled boolean not null default false,
    two_factor_secret_ciphertext bytea,
    password_changed_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create table roles (
    id smallserial primary key,
    code varchar(64) not null unique,
    highest_admin boolean not null default false,
    created_at timestamptz not null default now()
);

create table user_roles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete restrict,
    role_id smallint not null references roles(id) on delete restrict,
    granted_by uuid references users(id) on delete restrict,
    granted_at timestamptz not null default now(),
    revoked_at timestamptz,
    row_version bigint not null default 0 check (row_version >= 0)
);
create unique index uq_user_roles_active on user_roles(user_id, role_id) where revoked_at is null;

create table questionnaire_schemas (
    id uuid primary key default gen_random_uuid(),
    version integer not null unique check (version > 0),
    definition jsonb not null,
    active_for_new_signup boolean not null default false,
    activated_at timestamptz,
    created_at timestamptz not null default now()
);
create unique index uq_questionnaire_single_active on questionnaire_schemas(active_for_new_signup)
    where active_for_new_signup;

create table questionnaire_responses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete restrict,
    schema_id uuid not null references questionnaire_schemas(id) on delete restrict,
    question_key varchar(128) not null,
    response_version integer not null check (response_version > 0),
    response_value jsonb not null,
    active boolean not null default true,
    superseded_at timestamptz,
    created_at timestamptz not null default now()
);
create unique index uq_questionnaire_response_active
    on questionnaire_responses(user_id, schema_id, question_key) where active;

create table consent_evidence (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete restrict,
    document_code varchar(64) not null,
    document_version varchar(100) not null,
    document_sha256 char(64) not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
    accepted boolean not null check (accepted),
    accepted_at timestamptz not null,
    source_ip inet,
    user_agent text,
    created_at timestamptz not null default now(),
    unique(user_id, document_code, document_version)
);

create table sessions (
    id uuid primary key default gen_random_uuid(),
    session_hash bytea not null unique,
    user_id uuid not null references users(id) on delete restrict,
    role_snapshot jsonb not null,
    csrf_hash bytea not null,
    idle_expires_at timestamptz not null,
    absolute_expires_at timestamptz not null,
    last_seen_at timestamptz not null,
    revoked_at timestamptz,
    revocation_reason varchar(64),
    created_at timestamptz not null default now()
);

create table auth_challenges (
    id uuid primary key default gen_random_uuid(),
    flow_hash bytea not null unique,
    user_id uuid references users(id) on delete restrict,
    purpose varchar(64) not null,
    target_identity varchar(320),
    code_hash bytea,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    resend_count integer not null default 0 check (resend_count >= 0),
    expires_at timestamptz not null,
    consumed_at timestamptz,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table notification_outbox (
    id uuid primary key default gen_random_uuid(),
    event_type varchar(96) not null,
    recipient varchar(320) not null,
    payload jsonb not null,
    available_at timestamptz not null default now(),
    leased_until timestamptz,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    delivered_at timestamptz,
    last_error_code varchar(96),
    created_at timestamptz not null default now()
);

create table audit_outbox (
    id uuid primary key default gen_random_uuid(),
    event_type varchar(96) not null,
    actor_user_id uuid references users(id) on delete restrict,
    subject_user_id uuid references users(id) on delete restrict,
    payload jsonb not null,
    available_at timestamptz not null default now(),
    leased_until timestamptz,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    delivered_at timestamptz,
    created_at timestamptz not null default now()
);

create table audit_events (
    id uuid primary key,
    event_type varchar(96) not null,
    actor_user_id uuid,
    subject_user_id uuid,
    payload jsonb not null,
    occurred_at timestamptz not null,
    inserted_at timestamptz not null default now()
);

create or replace function reject_audit_event_mutation() returns trigger language plpgsql as $$
begin
    raise exception 'audit_events are append-only';
end;
$$;
create trigger audit_events_no_update_or_delete
    before update or delete on audit_events
    for each row execute function reject_audit_event_mutation();

create table feature_gates (
    gate_key varchar(128) primary key,
    enabled boolean not null,
    description text not null,
    updated_at timestamptz not null default now()
);

create table account_state_outbox (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete restrict,
    account_state_version bigint not null check (account_state_version >= 0),
    state varchar(32) not null check (state in ('ACTIVE', 'DEACTIVATED', 'DELETED')),
    event_payload jsonb not null,
    available_at timestamptz not null default now(),
    leased_until timestamptz,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    delivered_at timestamptz,
    created_at timestamptz not null default now(),
    unique(user_id, account_state_version)
);
