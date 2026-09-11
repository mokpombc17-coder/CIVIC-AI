CREATE TABLE opinion_map_generations (
    generation_id uuid PRIMARY KEY,
    task_id uuid NOT NULL,
    result_version integer NOT NULL,
    source_body_sha256 varchar(64) NOT NULL,
    prompt_version varchar(100) NOT NULL,
    status varchar(30) NOT NULL,
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz,
    output_json text,
    last_error_code varchar(200),
    created_at timestamptz NOT NULL,
    processing_started_at timestamptz,
    completed_at timestamptz,
    active_claim_id uuid,
    lease_expires_at timestamptz,
    updated_at timestamptz NOT NULL,
    CONSTRAINT uq_opinion_map_generation_task_result
        UNIQUE (task_id, result_version),
    CONSTRAINT ck_opinion_map_generation_result_version
        CHECK (result_version > 0),
    CONSTRAINT ck_opinion_map_generation_source_hash
        CHECK (source_body_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_opinion_map_generation_status
        CHECK (status IN (
            'PENDING', 'PROCESSING', 'RETRY_WAIT',
            'AVAILABLE', 'UNAVAILABLE')),
    CONSTRAINT ck_opinion_map_generation_attempt_count
        CHECK (attempt_count >= 0),
    CONSTRAINT ck_opinion_map_generation_processing
        CHECK (
            (status = 'PROCESSING'
                AND active_claim_id IS NOT NULL
                AND lease_expires_at IS NOT NULL)
            OR
            (status <> 'PROCESSING'
                AND active_claim_id IS NULL
                AND lease_expires_at IS NULL)),
    CONSTRAINT ck_opinion_map_generation_retry
        CHECK ((status = 'RETRY_WAIT') = (next_attempt_at IS NOT NULL)),
    CONSTRAINT ck_opinion_map_generation_output
        CHECK ((status = 'AVAILABLE') = (output_json IS NOT NULL)),
    CONSTRAINT ck_opinion_map_generation_completed
        CHECK (
            (status IN ('AVAILABLE', 'UNAVAILABLE'))
            = (completed_at IS NOT NULL)),
    CONSTRAINT ck_opinion_map_generation_error
        CHECK (
            (status IN ('RETRY_WAIT', 'UNAVAILABLE'))
            = (last_error_code IS NOT NULL)),
    CONSTRAINT ck_opinion_map_generation_updated_at
        CHECK (updated_at >= created_at)
);

CREATE INDEX ix_opinion_map_generation_dispatch
    ON opinion_map_generations (
        status,
        next_attempt_at,
        lease_expires_at,
        created_at)
    WHERE status IN ('PENDING', 'PROCESSING', 'RETRY_WAIT');
