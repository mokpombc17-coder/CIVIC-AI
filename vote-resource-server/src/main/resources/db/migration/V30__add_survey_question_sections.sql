CREATE TABLE survey_question_sections (
    section_id uuid PRIMARY KEY,
    content_version_id uuid NOT NULL,
    section_lineage_id uuid NOT NULL,
    section_key varchar(150) NOT NULL,
    title varchar(200) NOT NULL,
    description varchar(1000),
    display_order integer NOT NULL,
    CONSTRAINT uq_survey_question_section_ownership
        UNIQUE (section_id, content_version_id),
    CONSTRAINT uq_survey_question_section_content_lineage
        UNIQUE (content_version_id, section_lineage_id),
    CONSTRAINT uq_survey_question_section_content_key
        UNIQUE (content_version_id, section_key),
    CONSTRAINT uq_survey_question_section_content_order
        UNIQUE (content_version_id, display_order),
    CONSTRAINT fk_survey_question_section_content
        FOREIGN KEY (content_version_id)
        REFERENCES survey_content_versions (content_version_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_survey_question_section_key
        CHECK (btrim(section_key) <> ''),
    CONSTRAINT ck_survey_question_section_title
        CHECK (btrim(title) <> ''),
    CONSTRAINT ck_survey_question_section_description
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT ck_survey_question_section_display_order
        CHECK (display_order > 0)
);

INSERT INTO survey_question_sections (
    section_id,
    content_version_id,
    section_lineage_id,
    section_key,
    title,
    description,
    display_order)
SELECT
    group_id,
    content_version_id,
    group_lineage_id,
    'legacy.' || group_id::text,
    title,
    NULL,
    display_order
FROM survey_question_groups;

ALTER TABLE survey_question_groups
    ADD COLUMN section_id uuid;

UPDATE survey_question_groups
SET section_id = group_id;

ALTER TABLE survey_question_groups
    ALTER COLUMN section_id SET NOT NULL,
    ADD CONSTRAINT fk_survey_question_group_section
        FOREIGN KEY (section_id, content_version_id)
        REFERENCES survey_question_sections (
            section_id,
            content_version_id)
        ON DELETE CASCADE;

CREATE INDEX ix_survey_question_section_lineage
    ON survey_question_sections (section_lineage_id);
