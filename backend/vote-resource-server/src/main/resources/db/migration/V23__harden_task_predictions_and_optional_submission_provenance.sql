ALTER TABLE task_predictions
    ADD COLUMN active_attempt_id uuid,
    ADD COLUMN processing_started_at timestamptz,
    ADD COLUMN lease_expires_at timestamptz;

ALTER TABLE task_prediction_attempts
    ADD COLUMN lease_expires_at timestamptz,
    ADD COLUMN worker_id varchar(255),
    ADD COLUMN late_completion_observed_at timestamptz;

UPDATE task_prediction_attempts
SET lease_expires_at = requested_at + interval '90 seconds',
    worker_id = 'flyway-v23'
WHERE lease_expires_at IS NULL OR worker_id IS NULL;

ALTER TABLE task_prediction_attempts
    ALTER COLUMN lease_expires_at SET NOT NULL,
    ALTER COLUMN worker_id SET NOT NULL,
    DROP CONSTRAINT ck_task_prediction_attempt_outcome,
    ADD CONSTRAINT ck_task_prediction_attempt_outcome
        CHECK (outcome IN (
            'IN_PROGRESS', 'SUCCEEDED', 'TIMEOUT', 'NETWORK_ERROR',
            'HTTP_ERROR', 'INVALID_RESPONSE', 'IGNORED_LATE_RESPONSE',
            'LEASE_EXPIRED'
        )),
    ADD CONSTRAINT ck_task_prediction_attempt_lease
        CHECK (lease_expires_at > requested_at),
    ADD CONSTRAINT ck_task_prediction_attempt_worker
        CHECK (btrim(worker_id) <> '' AND worker_id = btrim(worker_id)),
    ADD CONSTRAINT ck_task_prediction_attempt_late_completion
        CHECK (late_completion_observed_at IS NULL
            OR late_completion_observed_at >= requested_at);

CREATE UNIQUE INDEX uq_task_prediction_active_attempt
    ON task_predictions (active_attempt_id)
    WHERE active_attempt_id IS NOT NULL;

CREATE INDEX ix_task_prediction_processing_lease
    ON task_predictions (status, lease_expires_at)
    WHERE status = 'PROCESSING';

ALTER TABLE task_predictions
    DROP CONSTRAINT ck_task_prediction_state,
    ADD CONSTRAINT ck_task_prediction_state
        CHECK (
            (status = 'PENDING'
                AND attempt_count = 0
                AND next_retry_at IS NULL
                AND last_error_code IS NULL
                AND last_error_message IS NULL
                AND started_at IS NULL
                AND completed_at IS NULL
                AND active_attempt_id IS NULL
                AND processing_started_at IS NULL
                AND lease_expires_at IS NULL)
            OR
            (status = 'PROCESSING'
                AND attempt_count > 0
                AND next_retry_at IS NULL
                AND last_error_code IS NULL
                AND last_error_message IS NULL
                AND started_at IS NOT NULL
                AND completed_at IS NULL
                AND active_attempt_id IS NOT NULL
                AND processing_started_at IS NOT NULL
                AND lease_expires_at > processing_started_at)
            OR
            (status = 'RETRY_WAIT'
                AND attempt_count > 0
                AND next_retry_at IS NOT NULL
                AND last_error_code IS NOT NULL
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
                AND started_at IS NOT NULL
                AND completed_at IS NOT NULL
                AND active_attempt_id IS NULL
                AND processing_started_at IS NULL
                AND lease_expires_at IS NULL)
            OR
            (status = 'FAILED'
                AND next_retry_at IS NULL
                AND last_error_code IS NOT NULL
                AND completed_at IS NOT NULL
                AND active_attempt_id IS NULL
                AND processing_started_at IS NULL
                AND lease_expires_at IS NULL)
        );

CREATE TABLE task_prediction_inputs (
    prediction_id uuid PRIMARY KEY,
    task_id uuid NOT NULL,
    user_id varchar(255) NOT NULL,
    persona_generation_id uuid NOT NULL,
    persona_version_id uuid NOT NULL,
    provider_persona_id varchar(512) NOT NULL,
    task_ends_at timestamptz NOT NULL,
    request_schema_version integer NOT NULL,
    algorithm_version varchar(100) NOT NULL,
    request_payload text NOT NULL,
    request_fingerprint char(64) NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT fk_task_prediction_input_prediction
        FOREIGN KEY (prediction_id)
        REFERENCES task_predictions (prediction_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_prediction_input_user
        CHECK (btrim(user_id) <> '' AND user_id = btrim(user_id)),
    CONSTRAINT ck_task_prediction_input_provider_persona
        CHECK (btrim(provider_persona_id) <> ''
            AND provider_persona_id = btrim(provider_persona_id)),
    CONSTRAINT ck_task_prediction_input_schema_version
        CHECK (request_schema_version >= 1),
    CONSTRAINT ck_task_prediction_input_algorithm
        CHECK (btrim(algorithm_version) <> ''
            AND algorithm_version = btrim(algorithm_version)),
    CONSTRAINT ck_task_prediction_input_payload
        CHECK (btrim(request_payload) <> ''),
    CONSTRAINT ck_task_prediction_input_fingerprint
        CHECK (request_fingerprint ~ '^[0-9a-f]{64}$')
);

ALTER TABLE task_submissions
    ALTER COLUMN prediction_id DROP NOT NULL,
    DROP CONSTRAINT ck_task_submission_reason_source,
    ADD CONSTRAINT ck_task_submission_reason_source
        CHECK (
            (reason_source = 'AI_ACCEPTED'
                AND prediction_id IS NOT NULL
                AND accepted_predicted_reason_id IS NOT NULL)
            OR
            (reason_source = 'USER_WRITTEN'
                AND accepted_predicted_reason_id IS NULL)
        );

ALTER TABLE opinion_map_submission_projections
    ALTER COLUMN prediction_id DROP NOT NULL,
    DROP CONSTRAINT ck_opinion_map_submission_projection_reason_source,
    ADD CONSTRAINT ck_opinion_map_submission_projection_reason_source
        CHECK (
            (reason_source = 'AI_ACCEPTED'
                AND prediction_id IS NOT NULL
                AND accepted_predicted_reason_id IS NOT NULL)
            OR
            (reason_source = 'USER_WRITTEN'
                AND accepted_predicted_reason_id IS NULL)
        );
