CREATE TABLE result_inbox (
    consumer_name varchar(100) NOT NULL,
    event_id uuid NOT NULL,
    event_type varchar(100) NOT NULL,
    schema_version integer NOT NULL,
    occurred_at timestamptz NOT NULL,
    aggregate_type varchar(100) NOT NULL,
    aggregate_id uuid NOT NULL,
    payload text NOT NULL,
    processed_at timestamptz NOT NULL,
    PRIMARY KEY (consumer_name, event_id),
    CONSTRAINT ck_result_inbox_consumer_name
        CHECK (
            btrim(consumer_name) <> ''
            AND consumer_name = btrim(consumer_name)
        ),
    CONSTRAINT ck_result_inbox_event_type
        CHECK (btrim(event_type) <> '' AND event_type = btrim(event_type)),
    CONSTRAINT ck_result_inbox_schema_version
        CHECK (schema_version > 0),
    CONSTRAINT ck_result_inbox_aggregate_type
        CHECK (
            btrim(aggregate_type) <> ''
            AND aggregate_type = btrim(aggregate_type)
        ),
    CONSTRAINT ck_result_inbox_payload_object
        CHECK (jsonb_typeof(payload::jsonb) = 'object')
);

CREATE INDEX ix_result_inbox_event
    ON result_inbox (event_id, consumer_name);
