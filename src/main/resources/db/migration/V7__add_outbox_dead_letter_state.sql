ALTER TABLE integration_outbox
    ADD COLUMN dead_lettered_at timestamptz;

ALTER TABLE integration_outbox
    DROP CONSTRAINT ck_integration_outbox_state;

ALTER TABLE integration_outbox
    ADD CONSTRAINT ck_integration_outbox_state
        CHECK (
            (published_at IS NULL
                AND dead_lettered_at IS NULL
                AND next_attempt_at IS NOT NULL)
            OR
            (published_at IS NOT NULL
                AND published_at >= occurred_at
                AND dead_lettered_at IS NULL
                AND next_attempt_at IS NULL
                AND last_error IS NULL)
            OR
            (published_at IS NULL
                AND dead_lettered_at IS NOT NULL
                AND dead_lettered_at >= occurred_at
                AND next_attempt_at IS NULL
                AND last_error IS NOT NULL)
        );
