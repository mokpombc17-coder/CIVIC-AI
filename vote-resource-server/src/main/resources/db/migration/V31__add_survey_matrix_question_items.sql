ALTER TABLE survey_questions
    DROP CONSTRAINT ck_survey_question_type,
    DROP CONSTRAINT ck_survey_question_rules;

ALTER TABLE survey_questions
    ADD CONSTRAINT ck_survey_question_type
        CHECK (type IN (
            'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_TEXT',
            'LONG_TEXT', 'NUMBER', 'SCALE',
            'MATRIX_SINGLE_CHOICE', 'MATRIX_SCALE'
        )),
    ADD CONSTRAINT ck_survey_question_rules
        CHECK (
            (type IN ('SINGLE_CHOICE', 'MATRIX_SINGLE_CHOICE')
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND text_max_length IS NULL
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL
                AND decimal_scale IS NULL
                AND scale_minimum IS NULL
                AND scale_maximum IS NULL
                AND scale_minimum_label IS NULL
                AND scale_maximum_label IS NULL)
            OR
            (type = 'MULTIPLE_CHOICE'
                AND minimum_selections IS NOT NULL
                AND maximum_selections IS NOT NULL
                AND minimum_selections >= 1
                AND maximum_selections >= minimum_selections
                AND text_max_length IS NULL
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL
                AND decimal_scale IS NULL
                AND scale_minimum IS NULL
                AND scale_maximum IS NULL
                AND scale_minimum_label IS NULL
                AND scale_maximum_label IS NULL)
            OR
            (type = 'SHORT_TEXT'
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND text_max_length BETWEEN 1 AND 500
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL
                AND decimal_scale IS NULL
                AND scale_minimum IS NULL
                AND scale_maximum IS NULL
                AND scale_minimum_label IS NULL
                AND scale_maximum_label IS NULL)
            OR
            (type = 'LONG_TEXT'
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND text_max_length BETWEEN 1 AND 5000
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL
                AND decimal_scale IS NULL
                AND scale_minimum IS NULL
                AND scale_maximum IS NULL
                AND scale_minimum_label IS NULL
                AND scale_maximum_label IS NULL)
            OR
            (type = 'NUMBER'
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND text_max_length IS NULL
                AND number_minimum IS NOT NULL
                AND number_maximum IS NOT NULL
                AND number_minimum <= number_maximum
                AND decimal_allowed IS NOT NULL
                AND decimal_scale BETWEEN 0 AND 10
                AND (decimal_allowed OR decimal_scale = 0)
                AND scale_minimum IS NULL
                AND scale_maximum IS NULL
                AND scale_minimum_label IS NULL
                AND scale_maximum_label IS NULL)
            OR
            (type IN ('SCALE', 'MATRIX_SCALE')
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND text_max_length IS NULL
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL
                AND decimal_scale IS NULL
                AND scale_minimum IN (0, 1)
                AND scale_maximum > scale_minimum
                AND scale_maximum <= 10)
        );

CREATE TABLE survey_question_items (
    item_id uuid PRIMARY KEY,
    question_id uuid NOT NULL,
    content_version_id uuid NOT NULL,
    item_lineage_id uuid NOT NULL,
    item_key varchar(150) NOT NULL,
    item_label varchar(200) NOT NULL,
    display_order integer NOT NULL,
    CONSTRAINT uq_survey_question_item_ownership
        UNIQUE (item_id, question_id, content_version_id),
    CONSTRAINT uq_survey_question_item_content_lineage
        UNIQUE (content_version_id, item_lineage_id),
    CONSTRAINT uq_survey_question_item_key
        UNIQUE (question_id, item_key),
    CONSTRAINT uq_survey_question_item_order
        UNIQUE (question_id, display_order),
    CONSTRAINT fk_survey_question_item_question
        FOREIGN KEY (question_id, content_version_id)
        REFERENCES survey_questions (question_id, content_version_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_survey_question_item_key
        CHECK (btrim(item_key) <> ''),
    CONSTRAINT ck_survey_question_item_label
        CHECK (btrim(item_label) <> ''),
    CONSTRAINT ck_survey_question_item_display_order
        CHECK (display_order > 0)
);

CREATE INDEX ix_survey_question_item_lineage
    ON survey_question_items (item_lineage_id);
