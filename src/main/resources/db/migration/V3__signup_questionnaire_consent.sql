create table legal_documents (
    document_id varchar(100) not null,
    document_version varchar(100) not null,
    body_sha256 char(64) not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
    path varchar(512) not null,
    active_for_new_signup boolean not null default false,
    published_at timestamptz not null default now(),
    primary key(document_id, document_version)
);
create unique index uq_legal_document_active
    on legal_documents(document_id) where active_for_new_signup;

create table signup_flows (
    id uuid primary key default gen_random_uuid(),
    email varchar(320) not null,
    normalized_email varchar(320) not null,
    questionnaire_schema_id uuid not null references questionnaire_schemas(id) on delete restrict,
    document_versions jsonb not null,
    expires_at timestamptz not null,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    check (normalized_email = lower(btrim(email)))
);
create index ix_signup_flows_expiry on signup_flows(expires_at) where completed_at is null;

alter table auth_challenges add column last_sent_at timestamptz;
alter table auth_challenges add column resend_window_started_at timestamptz;

create table login_throttles (
    identity_hash bytea not null,
    source_ip inet not null,
    failure_count integer not null default 0 check (failure_count >= 0),
    window_started_at timestamptz not null default now(),
    next_allowed_at timestamptz not null default now(),
    last_failure_at timestamptz not null default now(),
    primary key(identity_hash, source_ip)
);
