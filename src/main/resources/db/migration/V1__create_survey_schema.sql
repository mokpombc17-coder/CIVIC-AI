CREATE TABLE survey_content_versions (
    content_version_id uuid PRIMARY KEY,
    version_number bigint UNIQUE,
    status varchar(30) NOT NULL,
    row_version bigint NOT NULL DEFAULT 0,
    name varchar(200) NOT NULL,
    description varchar(1000),
    derived_from_content_version_id uuid,
    created_by varchar(255) NOT NULL,
    created_at timestamptz NOT NULL,
    last_modified_by varchar(255) NOT NULL,
    last_modified_at timestamptz NOT NULL,
    published_by varchar(255),
    published_at timestamptz,
    CONSTRAINT fk_survey_content_version_derived_from
        FOREIGN KEY (derived_from_content_version_id)
        REFERENCES survey_content_versions (content_version_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_survey_content_version_status
        CHECK (status IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT ck_survey_content_version_number_positive
        CHECK (version_number IS NULL OR version_number > 0),
    CONSTRAINT ck_survey_content_version_row_version
        CHECK (row_version >= 0),
    CONSTRAINT ck_survey_content_version_name
        CHECK (btrim(name) <> ''),
    CONSTRAINT ck_survey_content_version_audit_order
        CHECK (last_modified_at >= created_at
            AND (published_at IS NULL OR published_at >= created_at)),
    CONSTRAINT ck_survey_content_version_publication
        CHECK (
            (status = 'DRAFT'
                AND version_number IS NULL
                AND published_by IS NULL
                AND published_at IS NULL)
            OR
            (status = 'PUBLISHED'
                AND version_number IS NOT NULL
                AND published_by IS NOT NULL
                AND published_at IS NOT NULL)
        )
);

CREATE TABLE survey_questions (
    question_id uuid PRIMARY KEY,
    content_version_id uuid NOT NULL,
    question_lineage_id uuid NOT NULL,
    type varchar(30) NOT NULL,
    prompt varchar(500) NOT NULL,
    description varchar(1000),
    display_order integer NOT NULL,
    is_required boolean NOT NULL,
    minimum_selections integer,
    maximum_selections integer,
    text_max_length integer,
    number_minimum numeric(38, 10),
    number_maximum numeric(38, 10),
    decimal_allowed boolean,
    decimal_scale integer,
    scale_minimum integer,
    scale_maximum integer,
    scale_minimum_label varchar(200),
    scale_maximum_label varchar(200),
    CONSTRAINT uq_survey_question_id_content
        UNIQUE (question_id, content_version_id),
    CONSTRAINT uq_survey_question_content_order
        UNIQUE (content_version_id, display_order),
    CONSTRAINT uq_survey_question_content_lineage
        UNIQUE (content_version_id, question_lineage_id),
    CONSTRAINT fk_survey_question_content
        FOREIGN KEY (content_version_id)
        REFERENCES survey_content_versions (content_version_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_survey_question_type
        CHECK (type IN (
            'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_TEXT',
            'LONG_TEXT', 'NUMBER', 'SCALE'
        )),
    CONSTRAINT ck_survey_question_prompt
        CHECK (btrim(prompt) <> ''),
    CONSTRAINT ck_survey_question_description
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT ck_survey_question_display_order
        CHECK (display_order > 0),
    CONSTRAINT ck_survey_question_rules
        CHECK (
            (type = 'SINGLE_CHOICE'
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
            (type = 'SCALE'
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND text_max_length IS NULL
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL
                AND decimal_scale IS NULL
                AND scale_minimum IS NOT NULL
                AND scale_maximum IS NOT NULL
                AND scale_minimum >= 0
                AND scale_maximum <= 10
                AND scale_minimum < scale_maximum
                AND (scale_minimum_label IS NULL
                    OR btrim(scale_minimum_label) <> '')
                AND (scale_maximum_label IS NULL
                    OR btrim(scale_maximum_label) <> ''))
        )
);

CREATE INDEX ix_survey_question_lineage
    ON survey_questions (question_lineage_id);

CREATE TABLE survey_options (
    option_id uuid PRIMARY KEY,
    question_id uuid NOT NULL,
    content_version_id uuid NOT NULL,
    option_lineage_id uuid NOT NULL,
    kind varchar(30) NOT NULL,
    label varchar(200) NOT NULL,
    display_order integer NOT NULL,
    CONSTRAINT uq_survey_option_ownership
        UNIQUE (option_id, question_id, content_version_id),
    CONSTRAINT uq_survey_option_question_order
        UNIQUE (question_id, display_order),
    CONSTRAINT uq_survey_option_question_lineage
        UNIQUE (question_id, option_lineage_id),
    CONSTRAINT fk_survey_option_question
        FOREIGN KEY (question_id, content_version_id)
        REFERENCES survey_questions (question_id, content_version_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_survey_option_kind
        CHECK (kind IN ('STANDARD', 'OTHER')),
    CONSTRAINT ck_survey_option_label
        CHECK (btrim(label) <> ''),
    CONSTRAINT ck_survey_option_display_order
        CHECK (display_order > 0)
);

CREATE UNIQUE INDEX uq_survey_option_one_other_per_question
    ON survey_options (question_id)
    WHERE kind = 'OTHER';

CREATE INDEX ix_survey_option_lineage
    ON survey_options (option_lineage_id);

CREATE TABLE survey_round_control (
    control_id varchar(30) PRIMARY KEY,
    row_version bigint NOT NULL DEFAULT 0,
    CONSTRAINT ck_survey_round_control_global
        CHECK (control_id = 'GLOBAL'),
    CONSTRAINT ck_survey_round_control_row_version
        CHECK (row_version >= 0)
);

INSERT INTO survey_round_control (control_id, row_version)
VALUES ('GLOBAL', 0);

CREATE TABLE survey_rounds (
    round_id uuid PRIMARY KEY,
    round_number bigint NOT NULL UNIQUE,
    content_version_id uuid NOT NULL,
    status varchar(30) NOT NULL,
    enforcement_mode varchar(30),
    scheduled_at timestamptz,
    activated_at timestamptz,
    closed_at timestamptz,
    canceled_at timestamptz,
    closed_by_round_id uuid,
    created_by varchar(255) NOT NULL,
    created_at timestamptz NOT NULL,
    row_version bigint NOT NULL DEFAULT 0,
    CONSTRAINT uq_survey_round_id_content
        UNIQUE (round_id, content_version_id),
    CONSTRAINT fk_survey_round_content
        FOREIGN KEY (content_version_id)
        REFERENCES survey_content_versions (content_version_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_survey_round_closed_by
        FOREIGN KEY (closed_by_round_id)
        REFERENCES survey_rounds (round_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_survey_round_number
        CHECK (round_number > 0),
    CONSTRAINT ck_survey_round_status
        CHECK (status IN ('SCHEDULED', 'ACTIVE', 'CLOSED', 'CANCELED')),
    CONSTRAINT ck_survey_round_enforcement
        CHECK (enforcement_mode IS NULL
            OR enforcement_mode IN ('ADVISORY', 'REQUIRED')),
    CONSTRAINT ck_survey_round_row_version
        CHECK (row_version >= 0),
    CONSTRAINT ck_survey_round_closed_by_self
        CHECK (closed_by_round_id IS NULL OR closed_by_round_id <> round_id),
    CONSTRAINT ck_survey_round_times
        CHECK ((scheduled_at IS NULL OR scheduled_at >= created_at)
            AND (activated_at IS NULL OR activated_at >= created_at)
            AND (closed_at IS NULL OR closed_at >= activated_at)
            AND (canceled_at IS NULL OR canceled_at >= created_at)),
    CONSTRAINT ck_survey_round_lifecycle
        CHECK (
            (status = 'SCHEDULED'
                AND scheduled_at IS NOT NULL
                AND enforcement_mode IS NULL
                AND activated_at IS NULL
                AND closed_at IS NULL
                AND canceled_at IS NULL
                AND closed_by_round_id IS NULL)
            OR
            (status = 'ACTIVE'
                AND enforcement_mode IS NOT NULL
                AND activated_at IS NOT NULL
                AND closed_at IS NULL
                AND canceled_at IS NULL
                AND closed_by_round_id IS NULL)
            OR
            (status = 'CLOSED'
                AND enforcement_mode IS NOT NULL
                AND activated_at IS NOT NULL
                AND closed_at IS NOT NULL
                AND canceled_at IS NULL
                AND closed_by_round_id IS NOT NULL)
            OR
            (status = 'CANCELED'
                AND scheduled_at IS NOT NULL
                AND enforcement_mode IS NULL
                AND activated_at IS NULL
                AND closed_at IS NULL
                AND canceled_at IS NOT NULL
                AND closed_by_round_id IS NULL)
        )
);

CREATE UNIQUE INDEX uq_survey_round_one_active
    ON survey_rounds (status)
    WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX uq_survey_round_one_scheduled
    ON survey_rounds (status)
    WHERE status = 'SCHEDULED';

CREATE TABLE survey_round_transitions (
    transition_id uuid PRIMARY KEY,
    round_id uuid NOT NULL,
    content_version_id uuid NOT NULL,
    type varchar(40) NOT NULL,
    from_status varchar(30),
    to_status varchar(30),
    from_enforcement_mode varchar(30),
    to_enforcement_mode varchar(30),
    previous_scheduled_at timestamptz,
    new_scheduled_at timestamptz,
    actor_id varchar(255) NOT NULL,
    trigger varchar(40) NOT NULL,
    reason varchar(500),
    occurred_at timestamptz NOT NULL,
    related_round_id uuid,
    CONSTRAINT fk_survey_round_transition_round
        FOREIGN KEY (round_id, content_version_id)
        REFERENCES survey_rounds (round_id, content_version_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_survey_round_transition_related_round
        FOREIGN KEY (related_round_id)
        REFERENCES survey_rounds (round_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_survey_round_transition_type
        CHECK (type IN (
            'SCHEDULED', 'RESCHEDULED', 'CANCELED', 'ACTIVATED',
            'CLOSED', 'ENFORCEMENT_REQUIRED', 'ENFORCEMENT_RELAXED'
        )),
    CONSTRAINT ck_survey_round_transition_statuses
        CHECK ((from_status IS NULL OR from_status IN (
                'SCHEDULED', 'ACTIVE', 'CLOSED', 'CANCELED'))
            AND (to_status IS NULL OR to_status IN (
                'SCHEDULED', 'ACTIVE', 'CLOSED', 'CANCELED'))),
    CONSTRAINT ck_survey_round_transition_enforcement
        CHECK ((from_enforcement_mode IS NULL
                OR from_enforcement_mode IN ('ADVISORY', 'REQUIRED'))
            AND (to_enforcement_mode IS NULL
                OR to_enforcement_mode IN ('ADVISORY', 'REQUIRED'))),
    CONSTRAINT ck_survey_round_transition_trigger
        CHECK (trigger IN (
            'ADMIN_SCHEDULE', 'ADMIN_RESCHEDULE', 'ADMIN_CANCEL',
            'ADMIN_START_NOW', 'ADMIN_ENFORCEMENT_CHANGE', 'SCHEDULER',
            'SCHEDULER_RECOVERY', 'ADMIN_RECOVERY', 'LOCAL_BOOTSTRAP'
        )),
    CONSTRAINT ck_survey_round_transition_reason
        CHECK (reason IS NULL OR btrim(reason) <> '')
);

CREATE INDEX ix_survey_round_transition_round_occurred
    ON survey_round_transitions (round_id, occurred_at);

CREATE TABLE survey_responses (
    response_id uuid PRIMARY KEY,
    user_id varchar(255) NOT NULL,
    round_id uuid NOT NULL,
    content_version_id uuid NOT NULL,
    submitted_at timestamptz NOT NULL,
    CONSTRAINT uq_survey_response_user_round
        UNIQUE (user_id, round_id),
    CONSTRAINT uq_survey_response_id_content
        UNIQUE (response_id, content_version_id),
    CONSTRAINT fk_survey_response_round
        FOREIGN KEY (round_id, content_version_id)
        REFERENCES survey_rounds (round_id, content_version_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_survey_response_user_id
        CHECK (btrim(user_id) <> '')
);

CREATE INDEX ix_survey_response_user_submitted
    ON survey_responses (user_id, submitted_at DESC);

CREATE TABLE survey_answers (
    answer_id uuid PRIMARY KEY,
    response_id uuid NOT NULL,
    content_version_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answer_type varchar(30) NOT NULL,
    text_value varchar(5000),
    number_value numeric(38, 10),
    scale_value integer,
    CONSTRAINT uq_survey_answer_ownership
        UNIQUE (answer_id, response_id, content_version_id, question_id),
    CONSTRAINT uq_survey_answer_response_question
        UNIQUE (response_id, question_id),
    CONSTRAINT fk_survey_answer_response
        FOREIGN KEY (response_id, content_version_id)
        REFERENCES survey_responses (response_id, content_version_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_survey_answer_question
        FOREIGN KEY (question_id, content_version_id)
        REFERENCES survey_questions (question_id, content_version_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_survey_answer_type
        CHECK (answer_type IN (
            'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_TEXT',
            'LONG_TEXT', 'NUMBER', 'SCALE'
        )),
    CONSTRAINT ck_survey_answer_scalar_value
        CHECK (
            (answer_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE')
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
        )
);

CREATE TABLE survey_answer_selections (
    selection_id uuid PRIMARY KEY,
    answer_id uuid NOT NULL,
    response_id uuid NOT NULL,
    content_version_id uuid NOT NULL,
    question_id uuid NOT NULL,
    option_id uuid NOT NULL,
    input_text varchar(200),
    CONSTRAINT uq_survey_answer_selection_option
        UNIQUE (answer_id, option_id),
    CONSTRAINT fk_survey_answer_selection_answer
        FOREIGN KEY (
            answer_id, response_id, content_version_id, question_id)
        REFERENCES survey_answers (
            answer_id, response_id, content_version_id, question_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_survey_answer_selection_option
        FOREIGN KEY (option_id, question_id, content_version_id)
        REFERENCES survey_options (
            option_id, question_id, content_version_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_survey_answer_selection_input
        CHECK (input_text IS NULL OR btrim(input_text) <> '')
);

CREATE TABLE survey_idempotency_receipts (
    receipt_id uuid PRIMARY KEY,
    user_id varchar(255) NOT NULL,
    operation varchar(100) NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash bytea NOT NULL,
    status varchar(30) NOT NULL,
    outcome_schema_version integer NOT NULL,
    http_status integer,
    outcome jsonb,
    response_id uuid,
    created_at timestamptz NOT NULL,
    completed_at timestamptz,
    expires_at timestamptz,
    CONSTRAINT uq_survey_idempotency_receipt_key
        UNIQUE (user_id, operation, idempotency_key),
    CONSTRAINT fk_survey_idempotency_receipt_response
        FOREIGN KEY (response_id)
        REFERENCES survey_responses (response_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_survey_idempotency_receipt_user
        CHECK (btrim(user_id) <> ''),
    CONSTRAINT ck_survey_idempotency_receipt_operation
        CHECK (btrim(operation) <> ''),
    CONSTRAINT ck_survey_idempotency_receipt_hash
        CHECK (octet_length(request_hash) = 32),
    CONSTRAINT ck_survey_idempotency_receipt_status
        CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'REJECTED')),
    CONSTRAINT ck_survey_idempotency_receipt_schema_version
        CHECK (outcome_schema_version > 0),
    CONSTRAINT ck_survey_idempotency_receipt_expiry
        CHECK (expires_at IS NULL OR expires_at > created_at),
    CONSTRAINT ck_survey_idempotency_receipt_outcome
        CHECK (
            (status = 'PROCESSING'
                AND http_status IS NULL
                AND outcome IS NULL
                AND response_id IS NULL
                AND completed_at IS NULL)
            OR
            (status = 'SUCCEEDED'
                AND http_status BETWEEN 200 AND 299
                AND outcome IS NOT NULL
                AND response_id IS NOT NULL
                AND completed_at IS NOT NULL
                AND completed_at >= created_at)
            OR
            (status = 'REJECTED'
                AND http_status BETWEEN 400 AND 499
                AND outcome IS NOT NULL
                AND response_id IS NULL
                AND completed_at IS NOT NULL
                AND completed_at >= created_at)
        )
);

CREATE INDEX ix_survey_idempotency_receipt_expiry
    ON survey_idempotency_receipts (expires_at)
    WHERE expires_at IS NOT NULL;
