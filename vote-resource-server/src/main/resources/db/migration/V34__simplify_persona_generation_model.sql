DROP INDEX IF EXISTS ix_task_prediction_persona_version;
DROP INDEX IF EXISTS ix_result_submission_persona_version;

ALTER TABLE task_submissions
    DROP CONSTRAINT fk_task_submission_prediction;

ALTER TABLE task_predictions
    DROP CONSTRAINT uq_task_prediction_submission_ownership;

ALTER TABLE task_submissions
    DROP COLUMN persona_version_id;

ALTER TABLE task_prediction_inputs
    DROP COLUMN persona_version_id;

ALTER TABLE task_predictions
    DROP COLUMN persona_version_id,
    ADD CONSTRAINT uq_task_prediction_submission_ownership
        UNIQUE (
            prediction_id,
            user_id,
            task_id,
            persona_generation_id
        );

ALTER TABLE task_submissions
    ADD CONSTRAINT fk_task_submission_prediction
        FOREIGN KEY (
            prediction_id,
            user_id,
            task_id,
            persona_generation_id
        )
        REFERENCES task_predictions (
            prediction_id,
            user_id,
            task_id,
            persona_generation_id
        )
        ON DELETE RESTRICT;

DROP TABLE persona_versions;
