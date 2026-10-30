CREATE TABLE opinion_map_generation_manual_requests (
    request_id uuid PRIMARY KEY,
    generation_id uuid NOT NULL,
    action varchar(20) NOT NULL,
    previous_attempt_count integer NOT NULL,
    previous_error_code varchar(200),
    requested_by varchar(255) NOT NULL,
    requested_at timestamptz NOT NULL,
    CONSTRAINT fk_opinion_map_manual_request_generation
        FOREIGN KEY (generation_id)
        REFERENCES opinion_map_generations (generation_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_opinion_map_manual_request_action
        CHECK (action IN ('CREATED', 'RETRIED')),
    CONSTRAINT ck_opinion_map_manual_request_attempt_count
        CHECK (previous_attempt_count >= 0),
    CONSTRAINT ck_opinion_map_manual_request_previous_failure
        CHECK (
            (action = 'CREATED'
                AND previous_attempt_count = 0
                AND previous_error_code IS NULL)
            OR
            (action = 'RETRIED'
                AND previous_attempt_count > 0
                AND previous_error_code IS NOT NULL)),
    CONSTRAINT ck_opinion_map_manual_request_requested_by
        CHECK (btrim(requested_by) <> ''
            AND requested_by = btrim(requested_by))
);

CREATE INDEX ix_opinion_map_manual_request_generation
    ON opinion_map_generation_manual_requests (
        generation_id,
        requested_at DESC,
        request_id DESC);

CREATE INDEX ix_opinion_map_generation_unavailable
    ON opinion_map_generations (completed_at DESC, generation_id DESC)
    WHERE status = 'UNAVAILABLE';
