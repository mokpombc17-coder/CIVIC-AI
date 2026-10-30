CREATE TABLE persona_versions (
    persona_version_id uuid PRIMARY KEY,
    generation_id uuid NOT NULL,
    user_id varchar(255) NOT NULL,
    provider_persona_id varchar(512) NOT NULL,
    predicted_adoption_rate numeric(7, 6) NOT NULL,
    model_version varchar(128) NOT NULL,
    generated_at timestamptz NOT NULL,
    source_type varchar(30) NOT NULL,
    source_id uuid NOT NULL,
    CONSTRAINT uq_persona_version_generation
        UNIQUE (generation_id),
    CONSTRAINT uq_persona_version_provider_persona
        UNIQUE (provider_persona_id),
    CONSTRAINT fk_persona_version_generation
        FOREIGN KEY (generation_id, provider_persona_id)
        REFERENCES persona_generations (generation_id, persona_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_persona_version_user_id
        CHECK (btrim(user_id) <> '' AND user_id = btrim(user_id)),
    CONSTRAINT ck_persona_version_provider_persona_id
        CHECK (
            btrim(provider_persona_id) <> ''
            AND provider_persona_id = btrim(provider_persona_id)
        ),
    CONSTRAINT ck_persona_version_predicted_adoption_rate
        CHECK (
            predicted_adoption_rate >= 0
            AND predicted_adoption_rate <= 1
        ),
    CONSTRAINT ck_persona_version_model_version
        CHECK (
            btrim(model_version) <> ''
            AND model_version = btrim(model_version)
        ),
    CONSTRAINT ck_persona_version_source_type
        CHECK (source_type IN ('SURVEY_RESPONSE'))
);

CREATE INDEX ix_persona_version_user_latest
    ON persona_versions (
        user_id,
        generated_at DESC,
        persona_version_id DESC
    );

CREATE INDEX ix_persona_version_source
    ON persona_versions (source_type, source_id);
