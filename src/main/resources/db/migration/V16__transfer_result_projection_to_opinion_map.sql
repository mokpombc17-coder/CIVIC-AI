ALTER TABLE result_inbox
    RENAME TO opinion_map_inbox;

UPDATE opinion_map_inbox
SET consumer_name = 'opinionmap-task-submission-completed-v2'
WHERE consumer_name = 'result-task-submission-completed-v2';

ALTER TABLE opinion_map_inbox
    RENAME CONSTRAINT result_inbox_pkey
    TO opinion_map_inbox_pkey;

ALTER TABLE opinion_map_inbox
    RENAME CONSTRAINT ck_result_inbox_consumer_name
    TO ck_opinion_map_inbox_consumer_name;

ALTER TABLE opinion_map_inbox
    RENAME CONSTRAINT ck_result_inbox_event_type
    TO ck_opinion_map_inbox_event_type;

ALTER TABLE opinion_map_inbox
    RENAME CONSTRAINT ck_result_inbox_schema_version
    TO ck_opinion_map_inbox_schema_version;

ALTER TABLE opinion_map_inbox
    RENAME CONSTRAINT ck_result_inbox_aggregate_type
    TO ck_opinion_map_inbox_aggregate_type;

ALTER TABLE opinion_map_inbox
    RENAME CONSTRAINT ck_result_inbox_payload_object
    TO ck_opinion_map_inbox_payload_object;

ALTER INDEX ix_result_inbox_event
    RENAME TO ix_opinion_map_inbox_event;

ALTER TABLE result_submissions
    RENAME TO opinion_map_submission_projections;

ALTER TABLE opinion_map_submission_projections
    RENAME CONSTRAINT result_submissions_pkey
    TO opinion_map_submission_projections_pkey;

ALTER TABLE opinion_map_submission_projections
    RENAME CONSTRAINT uq_result_submission_user_task
    TO uq_opinion_map_submission_projection_user_task;

ALTER TABLE opinion_map_submission_projections
    RENAME CONSTRAINT ck_result_submission_user
    TO ck_opinion_map_submission_projection_user;

ALTER TABLE opinion_map_submission_projections
    RENAME CONSTRAINT ck_result_submission_reason_source
    TO ck_opinion_map_submission_projection_reason_source;

ALTER TABLE opinion_map_submission_projections
    RENAME CONSTRAINT ck_result_submission_final_reason
    TO ck_opinion_map_submission_projection_final_reason;

ALTER INDEX ix_result_submission_task
    RENAME TO ix_opinion_map_submission_projection_task;

ALTER INDEX ix_result_submission_persona_version
    RENAME TO ix_opinion_map_submission_projection_persona_version;
