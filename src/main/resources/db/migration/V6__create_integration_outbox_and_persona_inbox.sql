CREATE TABLE integration_outbox (
    event_id uuid PRIMARY KEY,
    event_type varchar(100) NOT NULL,
    schema_version integer NOT NULL,
    occurred_at timestamptz NOT NULL,
    aggregate_type varchar(100) NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL,
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz,
    published_at timestamptz,
    last_error varchar(1000),
    created_at timestamptz NOT NULL,
    CONSTRAINT ck_integration_outbox_event_type
        CHECK (btrim(event_type) <> '' AND event_type = btrim(event_type)),
    CONSTRAINT ck_integration_outbox_schema_version
        CHECK (schema_version > 0),
    CONSTRAINT ck_integration_outbox_aggregate_type
        CHECK (
            btrim(aggregate_type) <> ''
            AND aggregate_type = btrim(aggregate_type)
        ),
    CONSTRAINT ck_integration_outbox_payload_object
        CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT ck_integration_outbox_attempt_count
        CHECK (attempt_count >= 0),
    CONSTRAINT ck_integration_outbox_last_error
        CHECK (last_error IS NULL OR btrim(last_error) <> ''),
    CONSTRAINT ck_integration_outbox_state
        CHECK (
            (published_at IS NULL AND next_attempt_at IS NOT NULL)
            OR
            (published_at IS NOT NULL
                AND published_at >= occurred_at
                AND next_attempt_at IS NULL
                AND last_error IS NULL)
        )
);

CREATE INDEX ix_integration_outbox_dispatch
    ON integration_outbox (next_attempt_at, occurred_at, event_id)
    WHERE published_at IS NULL AND next_attempt_at IS NOT NULL;

CREATE INDEX ix_integration_outbox_aggregate
    ON integration_outbox (aggregate_type, aggregate_id, occurred_at);

CREATE TABLE persona_inbox (
    consumer_name varchar(100) NOT NULL,
    event_id uuid NOT NULL,
    event_type varchar(100) NOT NULL,
    processed_at timestamptz NOT NULL,
    PRIMARY KEY (consumer_name, event_id),
    CONSTRAINT ck_persona_inbox_consumer_name
        CHECK (
            btrim(consumer_name) <> ''
            AND consumer_name = btrim(consumer_name)
        ),
    CONSTRAINT ck_persona_inbox_event_type
        CHECK (btrim(event_type) <> '' AND event_type = btrim(event_type))
);

CREATE INDEX ix_persona_inbox_event
    ON persona_inbox (event_id, consumer_name);
