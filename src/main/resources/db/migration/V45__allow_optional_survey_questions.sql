ALTER TABLE survey_questions
    DROP CONSTRAINT ck_survey_question_required;

UPDATE survey_questions
SET is_required = false
WHERE question_key IN (
    'wellbeing.health-status',
    'demographics.religion',
    'politics.ideology',
    'politics.supported-party'
);
