create table consent_acceptance_policies (
    document_code varchar(64) not null,
    document_version varchar(100) not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    deactivated_at timestamptz,
    primary key (document_code, document_version)
);

insert into consent_acceptance_policies(document_code, document_version)
values ('SENSITIVE_INFORMATION_CONSENT', '2026-09-04');

create table consent_acceptances (
    consent_receipt_id uuid primary key,
    user_id uuid not null references users(id) on delete restrict,
    document_code varchar(64) not null,
    document_version varchar(100) not null,
    round_id uuid not null,
    client_clicked_at timestamptz not null,
    accepted_at timestamptz not null,
    idempotency_key uuid not null,
    request_sha256 char(64) not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null default now(),
    constraint fk_consent_acceptances_policy
        foreign key (document_code, document_version)
        references consent_acceptance_policies(document_code, document_version)
        on delete restrict,
    constraint uq_consent_acceptances_user_idempotency
        unique (user_id, idempotency_key)
);

create index ix_consent_acceptances_user_round_policy
    on consent_acceptances(user_id, round_id, document_code, document_version);
