CREATE TABLE opinion_map_snapshots (
    snapshot_id uuid PRIMARY KEY,
    task_id uuid NOT NULL UNIQUE,
    closure_type varchar(30) NOT NULL,
    closed_at timestamptz NOT NULL,
    expected_submission_count integer NOT NULL,
    response_count integer NOT NULL,
    finalized_at timestamptz NOT NULL,
    CONSTRAINT ck_opinion_map_snapshot_closure_type
        CHECK (closure_type IN ('DEADLINE_REACHED', 'EARLY_CLOSED')),
    CONSTRAINT ck_opinion_map_snapshot_expected_count
        CHECK (expected_submission_count >= 0),
    CONSTRAINT ck_opinion_map_snapshot_response_count
        CHECK (response_count = expected_submission_count),
    CONSTRAINT ck_opinion_map_snapshot_finalized_at
        CHECK (finalized_at >= closed_at)
);

CREATE INDEX ix_opinion_map_snapshot_finalized_at
    ON opinion_map_snapshots (finalized_at, snapshot_id);
