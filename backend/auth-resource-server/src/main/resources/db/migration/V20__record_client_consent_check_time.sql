alter table consent_evidence
    add column client_checked_at timestamptz;

comment on column consent_evidence.client_checked_at is
    'Client-reported instant when the user affirmatively checked the consent box; accepted_at remains the authoritative server receipt time.';
