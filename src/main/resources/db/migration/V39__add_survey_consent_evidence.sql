CREATE TABLE survey_consent_documents (
    round_id uuid PRIMARY KEY,
    document_code varchar(100) NOT NULL,
    document_version varchar(100) NOT NULL,
    title varchar(255) NOT NULL,
    document_content text NOT NULL,
    document_hash varchar(64) NOT NULL,
    published_at timestamptz NOT NULL,
    CONSTRAINT fk_survey_consent_document_round
        FOREIGN KEY (round_id) REFERENCES survey_rounds (round_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_survey_consent_document_code
        CHECK (btrim(document_code) <> ''),
    CONSTRAINT ck_survey_consent_document_version
        CHECK (btrim(document_version) <> ''),
    CONSTRAINT ck_survey_consent_document_title
        CHECK (btrim(title) <> ''),
    CONSTRAINT ck_survey_consent_document_content
        CHECK (btrim(document_content) <> ''),
    CONSTRAINT ck_survey_consent_document_hash
        CHECK (document_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE survey_consent_receipts (
    consent_receipt_id uuid PRIMARY KEY,
    user_id varchar(255) NOT NULL,
    round_id uuid NOT NULL,
    document_code varchar(100) NOT NULL,
    document_version varchar(100) NOT NULL,
    document_content_snapshot text NOT NULL,
    document_hash varchar(64) NOT NULL,
    accepted_at timestamptz NOT NULL,
    client_clicked_at timestamptz,
    idempotency_key uuid NOT NULL,
    request_hash varchar(64) NOT NULL,
    CONSTRAINT uq_survey_consent_receipt_user_key
        UNIQUE (user_id, idempotency_key),
    CONSTRAINT uq_survey_consent_receipt_identity
        UNIQUE (consent_receipt_id, user_id, round_id),
    CONSTRAINT fk_survey_consent_receipt_round
        FOREIGN KEY (round_id) REFERENCES survey_rounds (round_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_survey_consent_receipt_user
        CHECK (btrim(user_id) <> ''),
    CONSTRAINT ck_survey_consent_receipt_document_code
        CHECK (btrim(document_code) <> ''),
    CONSTRAINT ck_survey_consent_receipt_document_version
        CHECK (btrim(document_version) <> ''),
    CONSTRAINT ck_survey_consent_receipt_snapshot
        CHECK (btrim(document_content_snapshot) <> ''),
    CONSTRAINT ck_survey_consent_receipt_document_hash
        CHECK (document_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_survey_consent_receipt_request_hash
        CHECK (request_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX ix_survey_consent_receipt_user_accepted
    ON survey_consent_receipts (user_id, accepted_at DESC);

ALTER TABLE survey_responses
    ADD COLUMN consent_receipt_id uuid;

ALTER TABLE survey_responses
    ADD CONSTRAINT fk_survey_response_consent_receipt
    FOREIGN KEY (consent_receipt_id, user_id, round_id)
    REFERENCES survey_consent_receipts (
        consent_receipt_id, user_id, round_id)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX uq_survey_response_consent_receipt
    ON survey_responses (consent_receipt_id)
    WHERE consent_receipt_id IS NOT NULL;
