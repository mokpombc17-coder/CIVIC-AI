ALTER TABLE survey_answers
    DROP CONSTRAINT ck_survey_answer_type,
    DROP CONSTRAINT ck_survey_answer_scalar_value;

ALTER TABLE survey_answers
    ADD CONSTRAINT ck_survey_answer_type
        CHECK (answer_type IN (
            'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_TEXT',
            'LONG_TEXT', 'NUMBER', 'SCALE',
            'MATRIX_SINGLE_CHOICE', 'MATRIX_SCALE'
        )),
    ADD CONSTRAINT ck_survey_answer_scalar_value
        CHECK (
            (answer_type IN (
                    'SINGLE_CHOICE', 'MULTIPLE_CHOICE',
                    'MATRIX_SINGLE_CHOICE', 'MATRIX_SCALE')
                AND text_value IS NULL
                AND number_value IS NULL
                AND scale_value IS NULL)
            OR
            (answer_type IN ('SHORT_TEXT', 'LONG_TEXT')
                AND text_value IS NOT NULL
                AND btrim(text_value) <> ''
                AND number_value IS NULL
                AND scale_value IS NULL)
            OR
            (answer_type = 'NUMBER'
                AND text_value IS NULL
                AND number_value IS NOT NULL
                AND scale_value IS NULL)
            OR
            (answer_type = 'SCALE'
                AND text_value IS NULL
                AND number_value IS NULL
                AND scale_value IS NOT NULL)
        );

CREATE TABLE survey_answer_item_values (
    item_value_id uuid PRIMARY KEY,
    answer_id uuid NOT NULL,
    response_id uuid NOT NULL,
    content_version_id uuid NOT NULL,
    question_id uuid NOT NULL,
    item_id uuid NOT NULL,
    answer_type varchar(30) NOT NULL,
    option_id uuid,
    input_text varchar(200),
    scale_value integer,
    CONSTRAINT uq_survey_answer_item_value
        UNIQUE (answer_id, item_id),
    CONSTRAINT fk_survey_answer_item_value_answer
        FOREIGN KEY (
            answer_id, response_id, content_version_id, question_id)
        REFERENCES survey_answers (
            answer_id, response_id, content_version_id, question_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_survey_answer_item_value_item
        FOREIGN KEY (item_id, question_id, content_version_id)
        REFERENCES survey_question_items (
            item_id, question_id, content_version_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_survey_answer_item_value_option
        FOREIGN KEY (option_id, question_id, content_version_id)
        REFERENCES survey_options (
            option_id, question_id, content_version_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_survey_answer_item_value_type
        CHECK (answer_type IN ('MATRIX_SINGLE_CHOICE', 'MATRIX_SCALE')),
    CONSTRAINT ck_survey_answer_item_value_shape
        CHECK (
            (answer_type = 'MATRIX_SINGLE_CHOICE'
                AND option_id IS NOT NULL
                AND scale_value IS NULL)
            OR
            (answer_type = 'MATRIX_SCALE'
                AND option_id IS NULL
                AND input_text IS NULL
                AND scale_value IS NOT NULL)
        ),
    CONSTRAINT ck_survey_answer_item_value_input
        CHECK (input_text IS NULL OR btrim(input_text) <> '')
);
