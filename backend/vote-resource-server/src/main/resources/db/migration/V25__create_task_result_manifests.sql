CREATE TABLE task_result_manifests (
    task_id uuid PRIMARY KEY,
    result_version integer NOT NULL,
    schema_version varchar(50) NOT NULL,
    closed_at timestamptz NOT NULL,
    response_count integer NOT NULL,
    body_sha256 varchar(64) NOT NULL,
    finalized_at timestamptz NOT NULL,
    CONSTRAINT fk_task_result_manifest_task
        FOREIGN KEY (task_id)
        REFERENCES tasks (task_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_task_result_manifest_version
        CHECK (result_version > 0),
    CONSTRAINT ck_task_result_manifest_schema
        CHECK (btrim(schema_version) <> ''),
    CONSTRAINT ck_task_result_manifest_response_count
        CHECK (response_count >= 0),
    CONSTRAINT ck_task_result_manifest_hash
        CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_task_result_manifest_time
        CHECK (finalized_at >= closed_at)
);
