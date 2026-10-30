DROP TABLE task_submission_answer_selections;
DROP TABLE task_submission_answers;
DROP TABLE task_prediction_candidate_selections;
DROP TABLE task_prediction_candidates;

ALTER TABLE task_questions
    DROP CONSTRAINT ck_task_question_type,
    DROP CONSTRAINT ck_task_question_order,
    ADD CONSTRAINT ck_task_question_type
        CHECK (type = 'SINGLE_CHOICE'),
    ADD CONSTRAINT ck_task_question_order
        CHECK (display_order = 1);

ALTER TABLE task_options
    DROP CONSTRAINT ck_task_option_question_type,
    DROP CONSTRAINT ck_task_option_kind,
    ADD CONSTRAINT ck_task_option_question_type
        CHECK (question_type = 'SINGLE_CHOICE'),
    ADD CONSTRAINT ck_task_option_kind
        CHECK (kind = 'STANDARD');

ALTER TABLE task_predictions
    DROP CONSTRAINT ck_task_prediction_policy,
    DROP COLUMN requested_candidate_count,
    ADD CONSTRAINT ck_task_prediction_policy
        CHECK (btrim(candidate_policy_version) <> ''
            AND candidate_policy_version = btrim(candidate_policy_version));

CREATE TABLE task_predicted_reasons (
    predicted_reason_id uuid PRIMARY KEY,
    prediction_id uuid NOT NULL,
    option_id uuid NOT NULL,
    reason_order integer NOT NULL,
    reason varchar(500) NOT NULL,
    CONSTRAINT uq_task_predicted_reason_ownership
        UNIQUE (predicted_reason_id, prediction_id, option_id),
    CONSTRAINT uq_task_predicted_reason_option_order
        UNIQUE (prediction_id, option_id, reason_order),
    CONSTRAINT fk_task_predicted_reason_prediction
        FOREIGN KEY (prediction_id)
        REFERENCES task_predictions (prediction_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_task_predicted_reason_option
        FOREIGN KEY (option_id)
        REFERENCES task_options (option_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_predicted_reason_order
        CHECK (reason_order IN (1, 2)),
    CONSTRAINT ck_task_predicted_reason_text
        CHECK (btrim(reason) <> '' AND reason = btrim(reason))
);

ALTER TABLE task_submissions
    ADD COLUMN question_id uuid NOT NULL,
    ADD COLUMN selected_option_id uuid NOT NULL,
    ADD COLUMN reason_source varchar(30) NOT NULL,
    ADD COLUMN accepted_predicted_reason_id uuid,
    ADD COLUMN final_reason varchar(500) NOT NULL,
    ADD CONSTRAINT fk_task_submission_question
        FOREIGN KEY (question_id, task_id)
        REFERENCES task_questions (question_id, task_id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_task_submission_selected_option
        FOREIGN KEY (selected_option_id, task_id, question_id)
        REFERENCES task_options (option_id, task_id, question_id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_task_submission_accepted_reason
        FOREIGN KEY (
            accepted_predicted_reason_id, prediction_id, selected_option_id)
        REFERENCES task_predicted_reasons (
            predicted_reason_id, prediction_id, option_id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT ck_task_submission_reason_source
        CHECK (
            (reason_source = 'AI_ACCEPTED'
                AND accepted_predicted_reason_id IS NOT NULL)
            OR
            (reason_source = 'USER_WRITTEN'
                AND accepted_predicted_reason_id IS NULL)
        ),
    ADD CONSTRAINT ck_task_submission_final_reason
        CHECK (btrim(final_reason) <> ''
            AND final_reason = btrim(final_reason));
