CREATE TABLE opinion_map_finalizations (
    task_id uuid PRIMARY KEY,
    closure_type varchar(30) NOT NULL,
    closed_at timestamptz NOT NULL,
    expected_submission_count integer NOT NULL,
    status varchar(50) NOT NULL,
    projected_submission_count integer NOT NULL,
    evaluated_at timestamptz NOT NULL,
    CONSTRAINT ck_opinion_map_finalization_closure_type
        CHECK (closure_type IN ('DEADLINE_REACHED', 'EARLY_CLOSED')),
    CONSTRAINT ck_opinion_map_finalization_expected_count
        CHECK (expected_submission_count >= 0),
    CONSTRAINT ck_opinion_map_finalization_projected_count
        CHECK (projected_submission_count >= 0),
    CONSTRAINT ck_opinion_map_finalization_status
        CHECK (
            (status = 'WAITING_FOR_SUBMISSIONS'
                AND projected_submission_count < expected_submission_count)
            OR
            (status = 'READY_TO_FINALIZE'
                AND projected_submission_count = expected_submission_count)
            OR
            (status = 'SUBMISSION_COUNT_INCONSISTENT'
                AND projected_submission_count > expected_submission_count)
        )
);

CREATE INDEX ix_opinion_map_finalization_status
    ON opinion_map_finalizations (status, evaluated_at, task_id);
