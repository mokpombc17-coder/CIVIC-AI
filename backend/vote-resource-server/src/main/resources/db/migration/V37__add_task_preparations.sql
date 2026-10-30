CREATE TABLE task_preparations (
    task_id uuid PRIMARY KEY
        REFERENCES tasks (task_id) ON DELETE CASCADE,
    request_id uuid NOT NULL UNIQUE,
    content_fingerprint varchar(71) NOT NULL,
    request_payload text NOT NULL,
    status varchar(20) NOT NULL,
    attempt_count integer NOT NULL,
    processing_started_at timestamptz,
    next_retry_at timestamptz,
    prepared_at timestamptz,
    last_error_code varchar(120),
    last_error_detail varchar(1000),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT ck_task_preparation_fingerprint
        CHECK (content_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT ck_task_preparation_payload
        CHECK (length(btrim(request_payload)) > 0),
    CONSTRAINT ck_task_preparation_status
        CHECK (status IN ('PROCESSING', 'READY', 'FAILED', 'REJECTED')),
    CONSTRAINT ck_task_preparation_attempt_count
        CHECK (attempt_count > 0),
    CONSTRAINT ck_task_preparation_audit_times
        CHECK (created_at <= updated_at),
    CONSTRAINT ck_task_preparation_state
        CHECK (
            (status = 'PROCESSING'
                AND processing_started_at IS NOT NULL
                AND next_retry_at IS NULL
                AND prepared_at IS NULL
                AND last_error_code IS NULL
                AND last_error_detail IS NULL)
            OR
            (status = 'READY'
                AND processing_started_at IS NULL
                AND next_retry_at IS NULL
                AND prepared_at IS NOT NULL
                AND last_error_code IS NULL
                AND last_error_detail IS NULL)
            OR
            (status = 'FAILED'
                AND processing_started_at IS NULL
                AND next_retry_at IS NOT NULL
                AND prepared_at IS NULL
                AND last_error_code IS NOT NULL
                AND length(btrim(last_error_code)) > 0
                AND last_error_detail IS NOT NULL
                AND length(btrim(last_error_detail)) > 0)
            OR
            (status = 'REJECTED'
                AND processing_started_at IS NULL
                AND next_retry_at IS NULL
                AND prepared_at IS NULL
                AND last_error_code IS NOT NULL
                AND length(btrim(last_error_code)) > 0
                AND last_error_detail IS NOT NULL
                AND length(btrim(last_error_detail)) > 0)
        )
);
