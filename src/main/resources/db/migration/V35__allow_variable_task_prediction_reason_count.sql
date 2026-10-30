ALTER TABLE task_predicted_reasons
    DROP CONSTRAINT ck_task_predicted_reason_order,
    ADD CONSTRAINT ck_task_predicted_reason_order
        CHECK (reason_order BETWEEN 1 AND 5);
