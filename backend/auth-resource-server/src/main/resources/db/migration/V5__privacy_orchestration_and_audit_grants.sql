do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'civic_audit_insert_only') then
        create role civic_audit_insert_only nologin;
    end if;
end
$$;

revoke all on audit_events from public;
grant usage on schema public to civic_audit_insert_only;
grant insert on audit_events to civic_audit_insert_only;
revoke all on users, credentials, roles, user_roles, questionnaire_schemas,
    questionnaire_responses, consent_evidence, sessions, auth_challenges,
    notification_outbox, audit_outbox, feature_gates, account_state_outbox,
    signup_flows, legal_documents, login_throttles from civic_audit_insert_only;

create table privacy_operations (
    id uuid primary key default gen_random_uuid(),
    external_request_evidence_id varchar(255) not null unique,
    subject_id uuid not null,
    requested_scopes jsonb not null,
    request_verified boolean not null check (request_verified),
    status varchar(32) not null check (status in ('PENDING', 'PARTIAL', 'COMPLETE', 'FAILED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table privacy_command_outbox (
    id uuid primary key default gen_random_uuid(),
    operation_id uuid not null references privacy_operations(id) on delete restrict,
    service_code varchar(32) not null check (service_code in ('MAIN', 'RAG')),
    command_payload jsonb not null,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    available_at timestamptz not null default now(),
    leased_until timestamptz,
    delivered_at timestamptz,
    created_at timestamptz not null default now(),
    unique(operation_id, service_code)
);

create table privacy_results (
    operation_id uuid not null references privacy_operations(id) on delete restrict,
    service_code varchar(32) not null check (service_code in ('MAIN', 'RAG')),
    result_status varchar(32) not null check (result_status in ('COMPLETE', 'FAILED')),
    aggregate_evidence varchar(255) not null,
    received_at timestamptz not null default now(),
    primary key(operation_id, service_code)
);

create table deletion_tombstones (
    subject_id uuid primary key,
    external_request_evidence_id varchar(255) not null,
    deletion_version bigint not null check (deletion_version > 0),
    deleted_at timestamptz not null default now()
);

delete from feature_gates;
insert into feature_gates(gate_key, enabled, description) values
    ('PUBLIC_SIGNUP_ENABLED', false, 'Allow new public signup'),
    ('EXTERNAL_LLM_PERSONAL_DATA_ENABLED', false, 'Allow external LLM processing of personal data'),
    ('RAG_PARTICIPANT_QUERY_ENABLED', false, 'Allow participant RAG queries'),
    ('SINGLE_CELL_RESULT_ENABLED', false, 'Deferred single-cell results'),
    ('ELECTION_TASK_ENABLED', false, 'Deferred election and vote tasks'),
    ('HIGH_IMPACT_USE_ENABLED', false, 'High-impact use remains disabled by default');
