UPDATE survey_questions
SET is_required = true
WHERE is_required = false;

ALTER TABLE survey_questions
    ALTER COLUMN is_required SET DEFAULT true;

ALTER TABLE survey_questions
    ADD CONSTRAINT ck_survey_question_required
        CHECK (is_required);
