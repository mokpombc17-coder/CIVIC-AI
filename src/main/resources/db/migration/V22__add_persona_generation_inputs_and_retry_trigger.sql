CREATE TABLE persona_generation_inputs (
    generation_id uuid PRIMARY KEY,
    source_id uuid NOT NULL,
    user_id varchar(255) NOT NULL,
    request_schema_version integer NOT NULL,
    request_payload text NOT NULL,
    request_fingerprint char(64) NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT fk_persona_generation_input_generation
        FOREIGN KEY (generation_id)
        REFERENCES persona_generations (generation_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_persona_generation_input_schema
        CHECK (request_schema_version >= 1),
    CONSTRAINT ck_persona_generation_input_user
        CHECK (btrim(user_id) <> '' AND user_id = btrim(user_id)),
    CONSTRAINT ck_persona_generation_input_payload
        CHECK (btrim(request_payload) <> ''),
    CONSTRAINT ck_persona_generation_input_fingerprint
        CHECK (request_fingerprint ~ '^[0-9a-f]{64}$')
);

ALTER TABLE persona_generations
    ADD COLUMN retry_trigger varchar(20);

UPDATE persona_generations generation
SET retry_trigger = CASE
    WHEN EXISTS (
        SELECT 1
        FROM persona_generation_retry_requests request
        WHERE request.generation_id = generation.generation_id
          AND request.requested_at = generation.next_attempt_at
    ) THEN 'MANUAL'
    ELSE 'AUTOMATIC'
END
WHERE generation.status = 'FAILED'
  AND generation.next_attempt_at IS NOT NULL;

ALTER TABLE persona_generations
    DROP CONSTRAINT ck_persona_generation_state,
    ADD CONSTRAINT ck_persona_generation_retry_trigger
        CHECK (retry_trigger IS NULL
            OR retry_trigger IN ('AUTOMATIC', 'MANUAL')),
    ADD CONSTRAINT ck_persona_generation_state
        CHECK (
            (status = 'PENDING'
                AND attempt_count = 0
                AND persona_id IS NULL
                AND last_error_code IS NULL
                AND processing_started_at IS NULL
                AND completed_at IS NULL
                AND next_attempt_at IS NOT NULL
                AND retry_trigger IS NULL
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
                AND retry_trigger IS NULL
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
                AND retry_trigger IS NULL
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
                AND (
                    (next_attempt_at IS NULL AND retry_trigger IS NULL)
                    OR
                    (next_attempt_at IS NOT NULL
                        AND next_attempt_at >= updated_at
                        AND retry_trigger IS NOT NULL)
                ))
        );
