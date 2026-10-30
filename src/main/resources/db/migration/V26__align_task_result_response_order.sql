DROP INDEX ix_task_submission_task_result;

CREATE INDEX ix_task_submission_task_result
    ON task_submissions (task_id, submission_id);
