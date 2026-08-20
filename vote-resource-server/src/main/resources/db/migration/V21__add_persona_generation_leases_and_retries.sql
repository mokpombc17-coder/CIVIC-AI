ALTER TABLE persona_generations
    ADD COLUMN claim_token uuid,
    ADD COLUMN lease_expires_at timestamptz;

CREATE TABLE persona_generation_attempts (
    generation_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    claim_token uuid NOT NULL,
    started_at timestamptz NOT NULL,
    lease_expires_at timestamptz NOT NULL,
    outcome varchar(30) NOT NULL,
    finished_at timestamptz,
    error_code varchar(100),
    late_completion_observed_at timestamptz,
    worker_id varchar(255) NOT NULL,
    PRIMARY KEY (generation_id, attempt_number),
    CONSTRAINT uq_persona_generation_attempt_claim_token
        UNIQUE (claim_token),
    CONSTRAINT fk_persona_generation_attempt_generation
        FOREIGN KEY (generation_id)
        REFERENCES persona_generations (generation_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_persona_generation_attempt_number
        CHECK (attempt_number >= 1),
    CONSTRAINT ck_persona_generation_attempt_worker
        CHECK (btrim(worker_id) <> '' AND worker_id = btrim(worker_id)),
    CONSTRAINT ck_persona_generation_attempt_time
        CHECK (
            lease_expires_at > started_at
            AND (finished_at IS NULL OR finished_at >= started_at)
            AND (late_completion_observed_at IS NULL
                OR late_completion_observed_at >= started_at)
        ),
    CONSTRAINT ck_persona_generation_attempt_outcome
        CHECK (outcome IN (
            'PROCESSING', 'SUCCEEDED', 'FAILED', 'LEASE_EXPIRED'
        )),
    CONSTRAINT ck_persona_generation_attempt_state
        CHECK (
            (outcome = 'PROCESSING'
                AND finished_at IS NULL
                AND error_code IS NULL)
            OR
            (outcome = 'SUCCEEDED'
                AND finished_at IS NOT NULL
                AND error_code IS NULL)
            OR
            (outcome IN ('FAILED', 'LEASE_EXPIRED')
                AND finished_at IS NOT NULL
                AND error_code IS NOT NULL
                AND btrim(error_code) <> '')
        )
);

INSERT INTO persona_generation_attempts (
    generation_id,
    attempt_number,
    claim_token,
    started_at,
    lease_expires_at,
    outcome,
    finished_at,
    error_code,
    worker_id
)
SELECT
    generation_id,
    attempt_count,
    generation_id,
    processing_started_at,
    GREATEST(
        processing_started_at + interval '1 microsecond',
        CURRENT_TIMESTAMP),
    'LEASE_EXPIRED',
    GREATEST(processing_started_at, CURRENT_TIMESTAMP),
    'PERSONA_PROCESSING_LEASE_MIGRATED',
    'flyway-v21'
FROM persona_generations
WHERE status = 'PROCESSING';

UPDATE persona_generations
SET status = 'FAILED',
    last_error_code = 'PERSONA_PROCESSING_LEASE_MIGRATED',
    next_attempt_at = GREATEST(updated_at, CURRENT_TIMESTAMP),
    completed_at = NULL,
    claim_token = NULL,
    lease_expires_at = NULL,
    updated_at = GREATEST(updated_at, CURRENT_TIMESTAMP)
WHERE status = 'PROCESSING';

ALTER TABLE persona_generations
    DROP CONSTRAINT ck_persona_generation_state,
    ADD CONSTRAINT uq_persona_generation_claim_token
        UNIQUE (claim_token),
    ADD CONSTRAINT ck_persona_generation_claim_lease
        CHECK (
            (claim_token IS NULL AND lease_expires_at IS NULL)
            OR
            (claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)
        ),
    ADD CONSTRAINT ck_persona_generation_state
        CHECK (
            (status = 'PENDING'
                AND attempt_count = 0
                AND persona_id IS NULL
                AND last_error_code IS NULL
                AND processing_started_at IS NULL
                AND completed_at IS NULL
                AND next_attempt_at IS NOT NULL
                AND claim_token IS NULL
                AND lease_expires_at IS NULL)
            OR
            (status = 'PROCESSING'
                AND attempt_count > 0
                AND persona_id IS NULL
                AND last_error_code IS NULL
                AND processing_started_at IS NOT NULL
                AND completed_at IS NULL
                AND next_attempt_at IS NULL
                AND claim_token IS NOT NULL
                AND lease_expires_at > processing_started_at)
            OR
            (status = 'SUCCEEDED'
                AND attempt_count > 0
                AND persona_id IS NOT NULL
                AND last_error_code IS NULL
                AND processing_started_at IS NOT NULL
                AND completed_at IS NOT NULL
                AND completed_at >= processing_started_at
                AND next_attempt_at IS NULL
                AND claim_token IS NULL
                AND lease_expires_at IS NULL)
            OR
            (status = 'FAILED'
                AND attempt_count > 0
                AND persona_id IS NULL
                AND last_error_code IS NOT NULL
                AND processing_started_at IS NOT NULL
                AND completed_at IS NULL
                AND claim_token IS NULL
                AND lease_expires_at IS NULL
                AND (next_attempt_at IS NULL
                    OR next_attempt_at >= updated_at))
        );

DROP INDEX IF EXISTS ix_persona_generation_dispatch;

CREATE INDEX ix_persona_generation_dispatch
    ON persona_generations (
        status,
        next_attempt_at,
        created_at,
        generation_id
    )
    WHERE status IN ('PENDING', 'FAILED');

CREATE INDEX ix_persona_generation_expired_lease
    ON persona_generations (status, lease_expires_at, generation_id)
    WHERE status = 'PROCESSING';

CREATE TABLE persona_generation_retry_requests (
    retry_request_id uuid PRIMARY KEY,
    generation_id uuid NOT NULL,
    idempotency_key varchar(200) NOT NULL,
    failed_attempt_count integer NOT NULL,
    requested_by varchar(255) NOT NULL,
    requested_at timestamptz NOT NULL,
    reason varchar(1000) NOT NULL,
    request_fingerprint char(64) NOT NULL,
    CONSTRAINT uq_persona_generation_retry_idempotency
        UNIQUE (generation_id, idempotency_key),
    CONSTRAINT fk_persona_generation_retry_generation
        FOREIGN KEY (generation_id)
        REFERENCES persona_generations (generation_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_persona_generation_retry_key
        CHECK (
            btrim(idempotency_key) <> ''
            AND idempotency_key = btrim(idempotency_key)
        ),
    CONSTRAINT ck_persona_generation_retry_attempt_count
        CHECK (failed_attempt_count >= 1),
    CONSTRAINT ck_persona_generation_retry_requested_by
        CHECK (
            btrim(requested_by) <> ''
            AND requested_by = btrim(requested_by)
        ),
    CONSTRAINT ck_persona_generation_retry_reason
        CHECK (btrim(reason) <> '' AND reason = btrim(reason)),
    CONSTRAINT ck_persona_generation_retry_fingerprint
        CHECK (request_fingerprint ~ '^[0-9a-f]{64}$')
);

CREATE INDEX ix_persona_generation_retry_requested_at
    ON persona_generation_retry_requests (requested_at, retry_request_id);
