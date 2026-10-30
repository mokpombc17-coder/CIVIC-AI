ALTER TABLE survey_questions
    ADD COLUMN question_key varchar(150),
    ADD COLUMN source_number varchar(20),
    ADD COLUMN title varchar(200);

UPDATE survey_questions
SET question_key = 'legacy.' || question_id::text,
    source_number = display_order::text,
    title = prompt;

ALTER TABLE survey_questions
    ALTER COLUMN question_key SET NOT NULL,
    ALTER COLUMN source_number SET NOT NULL,
    ALTER COLUMN title SET NOT NULL,
    ADD CONSTRAINT uq_survey_question_content_key
        UNIQUE (content_version_id, question_key),
    ADD CONSTRAINT ck_survey_question_key
        CHECK (question_key ~ '^[a-z0-9]+([.-][a-z0-9]+)*$'),
    ADD CONSTRAINT ck_survey_question_source_number
        CHECK (btrim(source_number) <> ''),
    ADD CONSTRAINT ck_survey_question_title
        CHECK (btrim(title) <> '');

ALTER TABLE survey_options
    ADD COLUMN option_local_key varchar(20);

UPDATE survey_options
SET option_local_key = CASE
    WHEN display_order <= 26
        THEN chr(64 + display_order)
    ELSE chr(64 + ((display_order - 1) / 26))
        || chr(65 + ((display_order - 1) % 26))
    END;

ALTER TABLE survey_options
    ALTER COLUMN option_local_key SET NOT NULL,
    ADD CONSTRAINT uq_survey_option_question_local_key
        UNIQUE (question_id, option_local_key),
    ADD CONSTRAINT ck_survey_option_local_key
        CHECK (option_local_key ~ '^[A-Z]+$');
