ALTER TABLE task_lifecycle_history
    DROP CONSTRAINT ck_task_lifecycle_event_type;

ALTER TABLE task_lifecycle_history
    ADD CONSTRAINT ck_task_lifecycle_event_type
        CHECK (event_type IN (
            'CREATED', 'SCHEDULED', 'RESCHEDULED',
            'OPENED', 'CLOSED', 'CANCELLED'
        ));

CREATE TABLE task_admin_creation_receipts (
    actor_id varchar(255) NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash bytea NOT NULL,
    task_id uuid NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (actor_id, idempotency_key),
    CONSTRAINT fk_task_admin_creation_receipt_task
        FOREIGN KEY (task_id)
        REFERENCES tasks (task_id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT ck_task_admin_creation_receipt_actor
        CHECK (btrim(actor_id) <> '' AND actor_id = btrim(actor_id)),
    CONSTRAINT ck_task_admin_creation_receipt_hash
        CHECK (octet_length(request_hash) = 32)
);

CREATE INDEX ix_task_admin_creation_receipt_created
    ON task_admin_creation_receipts (created_at);
