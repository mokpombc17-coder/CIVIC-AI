ALTER TABLE task_preparations
    ADD COLUMN publication_verification_next_retry_at timestamptz;

CREATE INDEX ix_task_preparations_publication_verification_retry
    ON task_preparations (publication_verification_next_retry_at)
    WHERE publication_verification_next_retry_at IS NOT NULL;
