CREATE INDEX ix_task_submission_task_result
    ON task_submissions (task_id, submitted_at, submission_id);
