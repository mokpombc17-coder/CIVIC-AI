CREATE INDEX ix_task_submission_outcome_feed
    ON task_submissions (task_id, submitted_at, submission_id);

CREATE INDEX ix_task_submission_persona_generation
    ON task_submissions (task_id, persona_generation_id);
