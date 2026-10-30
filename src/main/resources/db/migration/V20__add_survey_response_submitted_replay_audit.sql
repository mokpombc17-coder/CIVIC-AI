CREATE TABLE survey_response_submitted_replays (
    original_event_id uuid PRIMARY KEY,
    replay_event_id uuid NOT NULL UNIQUE,
    requested_by varchar(200) NOT NULL,
    requested_at timestamptz NOT NULL,
    reason varchar(1000) NOT NULL,
    CONSTRAINT fk_survey_response_replay_original_event
        FOREIGN KEY (original_event_id)
        REFERENCES integration_outbox (event_id),
    CONSTRAINT fk_survey_response_replay_event
        FOREIGN KEY (replay_event_id)
        REFERENCES integration_outbox (event_id),
    CONSTRAINT ck_survey_response_replay_distinct_events
        CHECK (original_event_id <> replay_event_id),
    CONSTRAINT ck_survey_response_replay_requested_by
        CHECK (
            btrim(requested_by) <> ''
            AND requested_by = btrim(requested_by)
        ),
    CONSTRAINT ck_survey_response_replay_reason
        CHECK (
            btrim(reason) <> ''
            AND reason = btrim(reason)
        )
);

CREATE INDEX ix_survey_response_replays_replay_event
    ON survey_response_submitted_replays (replay_event_id);
