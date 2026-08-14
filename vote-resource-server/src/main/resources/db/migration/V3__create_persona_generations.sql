CREATE TABLE persona_generations (
    generation_id uuid PRIMARY KEY,
    survey_response_id uuid NOT NULL,
    persona_id varchar(512),
    status varchar(30) NOT NULL,
    attempt_count integer NOT NULL,
    last_error_code varchar(100),
    created_at timestamptz NOT NULL,
    processing_started_at timestamptz,
    completed_at timestamptz,
    next_attempt_at timestamptz,
    updated_at timestamptz NOT NULL,
    CONSTRAINT uq_persona_generation_response
        UNIQUE (survey_response_id),
    CONSTRAINT uq_persona_generation_persona
        UNIQUE (persona_id),
    CONSTRAINT fk_persona_generation_response
        FOREIGN KEY (survey_response_id)
        REFERENCES survey_responses (response_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_persona_generation_status
        CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT ck_persona_generation_attempt_count
        CHECK (attempt_count >= 0),
    CONSTRAINT ck_persona_generation_persona_id
        CHECK (persona_id IS NULL OR (
            btrim(persona_id) <> '' AND persona_id = btrim(persona_id)
        )),
    CONSTRAINT ck_persona_generation_error_code
        CHECK (last_error_code IS NULL OR btrim(last_error_code) <> ''),
    CONSTRAINT ck_persona_generation_timestamps
        CHECK (
            updated_at >= created_at
            AND (processing_started_at IS NULL
                OR processing_started_at >= created_at)
        ),
    CONSTRAINT ck_persona_generation_state
        CHECK (
            (status = 'PENDING'
                AND attempt_count = 0
                AND persona_id IS NULL
                AND last_error_code IS NULL
                AND processing_started_at IS NULL
                AND completed_at IS NULL
                AND next_attempt_at IS NOT NULL)
            OR
            (status = 'PROCESSING'
                AND attempt_count > 0
                AND persona_id IS NULL
                AND last_error_code IS NULL
                AND processing_started_at IS NOT NULL
                AND completed_at IS NULL
                AND next_attempt_at IS NULL)
            OR
            (status = 'SUCCEEDED'
                AND attempt_count > 0
                AND persona_id IS NOT NULL
                AND last_error_code IS NULL
                AND processing_started_at IS NOT NULL
                AND completed_at IS NOT NULL
                AND completed_at >= processing_started_at
                AND next_attempt_at IS NULL)
            OR
            (status = 'FAILED'
                AND attempt_count > 0
                AND persona_id IS NULL
                AND last_error_code IS NOT NULL
                AND processing_started_at IS NOT NULL
                AND completed_at IS NULL
                AND (next_attempt_at IS NULL
                    OR next_attempt_at >= updated_at))
        )
);

CREATE INDEX ix_persona_generation_dispatch
    ON persona_generations (next_attempt_at, created_at)
    WHERE status IN ('PENDING', 'FAILED')
      AND next_attempt_at IS NOT NULL;
