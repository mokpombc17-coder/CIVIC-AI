ALTER TABLE persona_generations
    DROP CONSTRAINT fk_persona_generation_response,
    DROP CONSTRAINT uq_persona_generation_response;

ALTER TABLE persona_generations
    RENAME COLUMN survey_response_id TO source_id;

ALTER TABLE persona_generations
    ADD COLUMN source_type varchar(30);

UPDATE persona_generations
SET source_type = 'SURVEY_RESPONSE';

ALTER TABLE persona_generations
    ALTER COLUMN source_type SET NOT NULL,
    ADD CONSTRAINT uq_persona_generation_source
        UNIQUE (source_type, source_id),
    ADD CONSTRAINT ck_persona_generation_source_type
        CHECK (source_type IN ('SURVEY_RESPONSE'));
