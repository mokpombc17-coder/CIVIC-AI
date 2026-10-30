ALTER TABLE task_predictions
    ADD COLUMN runtime_status_code varchar(200),
    ADD COLUMN runtime_status_detail varchar(2000),
    ADD COLUMN runtime_status_retryable boolean,
    ADD COLUMN runtime_status_max_wait_minutes integer;

ALTER TABLE task_predictions
    DROP CONSTRAINT ck_task_prediction_status,
    ADD CONSTRAINT ck_task_prediction_status
        CHECK (status IN (
            'PENDING', 'PROCESSING', 'REMOTE_PROCESSING', 'RETRY_WAIT',
            'SUCCEEDED', 'FAILED'
        )),
    ADD CONSTRAINT ck_task_prediction_runtime_status
        CHECK (
            (runtime_status_code IS NULL
                AND runtime_status_detail IS NULL
                AND runtime_status_retryable IS NULL
                AND runtime_status_max_wait_minutes IS NULL)
            OR
            (runtime_status_code IS NOT NULL
                AND btrim(runtime_status_code) <> ''
                AND runtime_status_code = btrim(runtime_status_code)
                AND runtime_status_detail IS NOT NULL
                AND btrim(runtime_status_detail) <> ''
                AND runtime_status_retryable IS NOT NULL
                AND runtime_status_max_wait_minutes >= 0)
        ),
    DROP CONSTRAINT ck_task_prediction_state,
    ADD CONSTRAINT ck_task_prediction_state
        CHECK (
            (status = 'PENDING'
                AND next_retry_at IS NULL
                AND last_error_code IS NULL
                AND last_error_message IS NULL
                AND completed_at IS NULL
                AND active_attempt_id IS NULL
                AND processing_started_at IS NULL
                AND lease_expires_at IS NULL
                AND (
                    (attempt_count = 0
                        AND started_at IS NULL
                        AND runtime_status_code IS NULL)
                    OR
                    (attempt_count > 0
                        AND started_at IS NOT NULL
                        AND runtime_status_code IS NOT NULL
                        AND runtime_status_retryable)))
            OR
            (status = 'PROCESSING'
                AND attempt_count > 0
                AND next_retry_at IS NULL
                AND last_error_code IS NULL
                AND last_error_message IS NULL
                AND runtime_status_code IS NULL
                AND started_at IS NOT NULL
                AND completed_at IS NULL
                AND active_attempt_id IS NOT NULL
                AND processing_started_at IS NOT NULL
                AND lease_expires_at > processing_started_at)
            OR
            (status = 'REMOTE_PROCESSING'
                AND attempt_count > 0
                AND next_retry_at IS NOT NULL
                AND last_error_code IS NULL
                AND last_error_message IS NULL
                AND runtime_status_code IS NOT NULL
                AND runtime_status_retryable
                AND started_at IS NOT NULL
                AND completed_at IS NULL
                AND active_attempt_id IS NULL
                AND processing_started_at IS NULL
                AND lease_expires_at IS NULL)
            OR
            (status = 'RETRY_WAIT'
                AND attempt_count > 0
                AND next_retry_at IS NOT NULL
                AND last_error_code IS NOT NULL
                AND runtime_status_code IS NULL
                AND started_at IS NOT NULL
                AND completed_at IS NULL
                AND active_attempt_id IS NULL
                AND processing_started_at IS NULL
                AND lease_expires_at IS NULL)
            OR
            (status = 'SUCCEEDED'
                AND attempt_count > 0
                AND next_retry_at IS NULL
                AND last_error_code IS NULL
                AND last_error_message IS NULL
                AND runtime_status_code IS NULL
                AND started_at IS NOT NULL
                AND completed_at IS NOT NULL
                AND active_attempt_id IS NULL
                AND processing_started_at IS NULL
                AND lease_expires_at IS NULL)
            OR
            (status = 'FAILED'
                AND next_retry_at IS NULL
                AND last_error_code IS NOT NULL
                AND (runtime_status_retryable IS NULL
                    OR NOT runtime_status_retryable)
                AND completed_at IS NOT NULL
                AND active_attempt_id IS NULL
                AND processing_started_at IS NULL
                AND lease_expires_at IS NULL)
        );

ALTER TABLE task_prediction_attempts
    DROP CONSTRAINT ck_task_prediction_attempt_outcome,
    ADD CONSTRAINT ck_task_prediction_attempt_outcome
        CHECK (outcome IN (
            'IN_PROGRESS', 'SUCCEEDED', 'REMOTE_PROCESSING', 'TIMEOUT',
            'NETWORK_ERROR', 'HTTP_ERROR', 'INVALID_RESPONSE',
            'IGNORED_LATE_RESPONSE', 'LEASE_EXPIRED'
        ));
