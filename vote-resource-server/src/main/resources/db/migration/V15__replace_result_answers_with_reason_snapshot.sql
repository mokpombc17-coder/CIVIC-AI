DROP TABLE result_submission_answer_selections;
DROP TABLE result_submission_answers;

ALTER TABLE result_submissions
    DROP CONSTRAINT ck_result_submission_answer_counts,
    DROP COLUMN submitted_answer_count,
    DROP COLUMN ai_accepted_answer_count,
    ADD COLUMN question_id uuid NOT NULL,
    ADD COLUMN selected_option_id uuid NOT NULL,
    ADD COLUMN reason_source varchar(30) NOT NULL,
    ADD COLUMN accepted_predicted_reason_id uuid,
    ADD COLUMN final_reason varchar(500) NOT NULL,
    ADD CONSTRAINT ck_result_submission_reason_source
        CHECK (
            (reason_source = 'AI_ACCEPTED'
                AND accepted_predicted_reason_id IS NOT NULL)
            OR
            (reason_source = 'USER_WRITTEN'
                AND accepted_predicted_reason_id IS NULL)
        ),
    ADD CONSTRAINT ck_result_submission_final_reason
        CHECK (btrim(final_reason) <> ''
            AND final_reason = btrim(final_reason));
