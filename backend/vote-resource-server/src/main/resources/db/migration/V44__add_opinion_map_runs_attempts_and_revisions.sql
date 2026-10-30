CREATE TABLE opinion_map_generation_runs (
    run_id uuid PRIMARY KEY,
    generation_id uuid NOT NULL,
    run_number integer NOT NULL,
    trigger_type varchar(30) NOT NULL,
    status varchar(30) NOT NULL,
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz,
    last_error_code varchar(200),
    requested_by varchar(255),
    idempotency_key varchar(100),
    requested_at timestamptz NOT NULL,
    processing_started_at timestamptz,
    completed_at timestamptz,
    active_claim_id uuid,
    lease_expires_at timestamptz,
    updated_at timestamptz NOT NULL,
    CONSTRAINT fk_opinion_map_run_generation
        FOREIGN KEY (generation_id)
        REFERENCES opinion_map_generations (generation_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_opinion_map_run_number
        UNIQUE (generation_id, run_number),
    CONSTRAINT ck_opinion_map_run_number
        CHECK (run_number > 0),
    CONSTRAINT ck_opinion_map_run_trigger
        CHECK (trigger_type IN (
            'TASK_CLOSED', 'ADMIN_RETRY', 'ADMIN_REGENERATE')),
    CONSTRAINT ck_opinion_map_run_status
        CHECK (status IN (
            'PENDING', 'PROCESSING', 'RETRY_WAIT',
            'AVAILABLE', 'UNAVAILABLE')),
    CONSTRAINT ck_opinion_map_run_attempt_count
        CHECK (attempt_count >= 0),
    CONSTRAINT ck_opinion_map_run_actor
        CHECK (
            (trigger_type = 'TASK_CLOSED' AND requested_by IS NULL)
            OR
            (trigger_type IN ('ADMIN_RETRY', 'ADMIN_REGENERATE')
                AND requested_by IS NOT NULL
                AND btrim(requested_by) <> ''
                AND requested_by = btrim(requested_by))),
    CONSTRAINT ck_opinion_map_run_processing
        CHECK (
            (status = 'PROCESSING'
                AND active_claim_id IS NOT NULL
                AND lease_expires_at IS NOT NULL)
            OR
            (status <> 'PROCESSING'
                AND active_claim_id IS NULL
                AND lease_expires_at IS NULL)),
    CONSTRAINT ck_opinion_map_run_retry
        CHECK ((status = 'RETRY_WAIT') = (next_attempt_at IS NOT NULL)),
    CONSTRAINT ck_opinion_map_run_completed
        CHECK (
            (status IN ('AVAILABLE', 'UNAVAILABLE'))
            = (completed_at IS NOT NULL)),
    CONSTRAINT ck_opinion_map_run_error
        CHECK (
            (status IN ('RETRY_WAIT', 'UNAVAILABLE'))
            = (last_error_code IS NOT NULL)),
    CONSTRAINT ck_opinion_map_run_updated_at
        CHECK (updated_at >= requested_at)
);

CREATE UNIQUE INDEX uq_opinion_map_active_run
    ON opinion_map_generation_runs (generation_id)
    WHERE status IN ('PENDING', 'PROCESSING', 'RETRY_WAIT');

CREATE UNIQUE INDEX uq_opinion_map_regeneration_idempotency
    ON opinion_map_generation_runs (generation_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX ix_opinion_map_run_dispatch
    ON opinion_map_generation_runs (
        status,
        next_attempt_at,
        lease_expires_at,
        requested_at)
    WHERE trigger_type = 'ADMIN_REGENERATE'
      AND status IN ('PENDING', 'PROCESSING', 'RETRY_WAIT');

CREATE TABLE opinion_map_generation_attempts (
    attempt_id uuid PRIMARY KEY,
    run_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    status varchar(20) NOT NULL,
    provider varchar(50) NOT NULL,
    requested_model varchar(200) NOT NULL,
    response_model varchar(200),
    provider_generation_id varchar(200),
    provider_request_id varchar(200),
    prompt_tokens bigint,
    completion_tokens bigint,
    total_tokens bigint,
    cached_tokens bigint,
    reasoning_tokens bigint,
    cost numeric(20, 10),
    currency varchar(10),
    finish_reason varchar(100),
    http_status integer,
    error_code varchar(200),
    retryable boolean,
    started_at timestamptz NOT NULL,
    completed_at timestamptz,
    latency_ms bigint,
    CONSTRAINT fk_opinion_map_attempt_run
        FOREIGN KEY (run_id)
        REFERENCES opinion_map_generation_runs (run_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_opinion_map_run_attempt
        UNIQUE (run_id, attempt_number),
    CONSTRAINT ck_opinion_map_attempt_number
        CHECK (attempt_number > 0),
    CONSTRAINT ck_opinion_map_attempt_status
        CHECK (status IN ('STARTED', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT ck_opinion_map_attempt_tokens
        CHECK (
            (prompt_tokens IS NULL OR prompt_tokens >= 0)
            AND (completion_tokens IS NULL OR completion_tokens >= 0)
            AND (total_tokens IS NULL OR total_tokens >= 0)
            AND (cached_tokens IS NULL OR cached_tokens >= 0)
            AND (reasoning_tokens IS NULL OR reasoning_tokens >= 0)),
    CONSTRAINT ck_opinion_map_attempt_cost
        CHECK (cost IS NULL OR cost >= 0),
    CONSTRAINT ck_opinion_map_attempt_completion
        CHECK (
            (status = 'STARTED'
                AND completed_at IS NULL
                AND latency_ms IS NULL)
            OR
            (status <> 'STARTED'
                AND completed_at IS NOT NULL
                AND latency_ms IS NOT NULL
                AND latency_ms >= 0)),
    CONSTRAINT ck_opinion_map_attempt_error
        CHECK (
            (status = 'FAILED') = (error_code IS NOT NULL)),
    CONSTRAINT ck_opinion_map_attempt_currency
        CHECK ((cost IS NULL) = (currency IS NULL))
);

CREATE INDEX ix_opinion_map_attempt_run
    ON opinion_map_generation_attempts (run_id, attempt_number);

CREATE TABLE opinion_map_revisions (
    revision_id uuid PRIMARY KEY,
    generation_id uuid NOT NULL,
    run_id uuid NOT NULL,
    revision_number integer NOT NULL,
    source varchar(20) NOT NULL,
    output_json text NOT NULL,
    prompt_version varchar(100) NOT NULL,
    requested_model varchar(200) NOT NULL,
    response_model varchar(200),
    created_at timestamptz NOT NULL,
    published_at timestamptz NOT NULL,
    CONSTRAINT fk_opinion_map_revision_generation
        FOREIGN KEY (generation_id)
        REFERENCES opinion_map_generations (generation_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_opinion_map_revision_run
        FOREIGN KEY (run_id)
        REFERENCES opinion_map_generation_runs (run_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_opinion_map_revision_number
        UNIQUE (generation_id, revision_number),
    CONSTRAINT uq_opinion_map_revision_run
        UNIQUE (run_id),
    CONSTRAINT ck_opinion_map_revision_number
        CHECK (revision_number > 0),
    CONSTRAINT ck_opinion_map_revision_source
        CHECK (source = 'AI'),
    CONSTRAINT ck_opinion_map_revision_output
        CHECK (btrim(output_json) <> ''),
    CONSTRAINT ck_opinion_map_revision_published
        CHECK (published_at >= created_at)
);

CREATE INDEX ix_opinion_map_revision_generation
    ON opinion_map_revisions (generation_id, revision_number DESC);
