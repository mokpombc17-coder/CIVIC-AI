ALTER TABLE task_predictions
    ADD COLUMN persona_version_id uuid;

UPDATE task_predictions prediction
SET persona_version_id = version.persona_version_id
FROM persona_versions version
WHERE version.generation_id = prediction.persona_generation_id;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM task_predictions
        WHERE persona_version_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'task prediction has no matching persona version';
    END IF;
END
$$;

ALTER TABLE task_predictions
    ALTER COLUMN persona_version_id SET NOT NULL;

ALTER TABLE task_submissions
    ADD COLUMN persona_version_id uuid;

UPDATE task_submissions submission
SET persona_version_id = prediction.persona_version_id
FROM task_predictions prediction
WHERE prediction.prediction_id = submission.prediction_id;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM task_submissions
        WHERE persona_version_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'task submission has no matching prediction persona version';
    END IF;
END
$$;

ALTER TABLE task_submissions
    ALTER COLUMN persona_version_id SET NOT NULL,
    DROP CONSTRAINT fk_task_submission_prediction;

ALTER TABLE task_predictions
    DROP CONSTRAINT uq_task_prediction_submission_ownership,
    ADD CONSTRAINT uq_task_prediction_submission_ownership
        UNIQUE (
            prediction_id,
            user_id,
            task_id,
            persona_generation_id,
            persona_version_id
        );

ALTER TABLE task_submissions
    ADD CONSTRAINT fk_task_submission_prediction
        FOREIGN KEY (
            prediction_id,
            user_id,
            task_id,
            persona_generation_id,
            persona_version_id
        )
        REFERENCES task_predictions (
            prediction_id,
            user_id,
            task_id,
            persona_generation_id,
            persona_version_id
        )
        ON DELETE RESTRICT;

CREATE INDEX ix_task_prediction_persona_version
    ON task_predictions (persona_version_id);
