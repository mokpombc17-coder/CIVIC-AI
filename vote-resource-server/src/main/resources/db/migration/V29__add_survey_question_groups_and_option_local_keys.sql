CREATE TABLE survey_question_groups (
    group_id uuid PRIMARY KEY,
    content_version_id uuid NOT NULL,
    group_lineage_id uuid NOT NULL,
    group_key varchar(150) NOT NULL,
    source_number varchar(20) NOT NULL,
    title varchar(200) NOT NULL,
    prompt varchar(1000) NOT NULL,
    description varchar(1000),
    display_order integer NOT NULL,
    CONSTRAINT uq_survey_question_group_ownership
        UNIQUE (group_id, content_version_id),
    CONSTRAINT uq_survey_question_group_content_lineage
        UNIQUE (content_version_id, group_lineage_id),
    CONSTRAINT uq_survey_question_group_content_key
        UNIQUE (content_version_id, group_key),
    CONSTRAINT uq_survey_question_group_content_order
        UNIQUE (content_version_id, display_order),
    CONSTRAINT fk_survey_question_group_content
        FOREIGN KEY (content_version_id)
        REFERENCES survey_content_versions (content_version_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_survey_question_group_key
        CHECK (btrim(group_key) <> ''),
    CONSTRAINT ck_survey_question_group_source_number
        CHECK (btrim(source_number) <> ''),
    CONSTRAINT ck_survey_question_group_title
        CHECK (btrim(title) <> ''),
    CONSTRAINT ck_survey_question_group_prompt
        CHECK (btrim(prompt) <> ''),
    CONSTRAINT ck_survey_question_group_description
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT ck_survey_question_group_display_order
        CHECK (display_order > 0)
);

INSERT INTO survey_question_groups (
    group_id,
    content_version_id,
    group_lineage_id,
    group_key,
    source_number,
    title,
    prompt,
    description,
    display_order)
SELECT
    question_id,
    content_version_id,
    question_lineage_id,
    'legacy.' || question_id::text,
    display_order::text,
    prompt,
    prompt,
    description,
    display_order
FROM survey_questions;

ALTER TABLE survey_questions
    ADD COLUMN group_id uuid,
    ADD COLUMN item_key varchar(150),
    ADD COLUMN item_label varchar(200),
    ADD COLUMN item_display_order integer;

UPDATE survey_questions
SET group_id = question_id,
    item_key = 'value',
    item_display_order = 1;

ALTER TABLE survey_questions
    ALTER COLUMN group_id SET NOT NULL,
    ALTER COLUMN item_key SET NOT NULL,
    ALTER COLUMN item_display_order SET NOT NULL,
    ADD CONSTRAINT fk_survey_question_group
        FOREIGN KEY (group_id, content_version_id)
        REFERENCES survey_question_groups (group_id, content_version_id)
        ON DELETE CASCADE,
    ADD CONSTRAINT uq_survey_question_group_item_key
        UNIQUE (group_id, item_key),
    ADD CONSTRAINT uq_survey_question_group_item_order
        UNIQUE (group_id, item_display_order),
    ADD CONSTRAINT ck_survey_question_item_key
        CHECK (btrim(item_key) <> ''),
    ADD CONSTRAINT ck_survey_question_item_label
        CHECK (item_label IS NULL OR btrim(item_label) <> ''),
    ADD CONSTRAINT ck_survey_question_item_display_order
        CHECK (item_display_order > 0);

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

CREATE INDEX ix_survey_question_group_lineage
    ON survey_question_groups (group_lineage_id);
