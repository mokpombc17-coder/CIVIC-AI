ALTER TABLE persona_generations
    ADD CONSTRAINT uq_persona_generation_identity
        UNIQUE (generation_id, persona_id);

CREATE TABLE tasks (
    task_id uuid PRIMARY KEY,
    row_version bigint NOT NULL DEFAULT 0,
    title varchar(200) NOT NULL,
    description varchar(2000),
    status varchar(30) NOT NULL,
    scheduled_open_at timestamptz,
    scheduled_close_at timestamptz,
    published_at timestamptz,
    opened_at timestamptz,
    closed_at timestamptz,
    closure_type varchar(30),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT uq_task_id_status
        UNIQUE (task_id, status),
    CONSTRAINT ck_task_row_version
        CHECK (row_version >= 0),
    CONSTRAINT ck_task_title
        CHECK (btrim(title) <> '' AND title = btrim(title)),
    CONSTRAINT ck_task_description
        CHECK (description IS NULL OR (
            btrim(description) <> '' AND description = btrim(description)
        )),
    CONSTRAINT ck_task_status
        CHECK (status IN ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED')),
    CONSTRAINT ck_task_closure_type
        CHECK (closure_type IS NULL OR closure_type IN (
            'DEADLINE_REACHED', 'EARLY_CLOSED',
            'CANCELLED', 'MISSED_SCHEDULE'
        )),
    CONSTRAINT ck_task_schedule
        CHECK (
            (scheduled_open_at IS NULL AND scheduled_close_at IS NULL)
            OR
            (scheduled_open_at IS NOT NULL
                AND scheduled_close_at IS NOT NULL
                AND scheduled_open_at < scheduled_close_at)
        ),
    CONSTRAINT ck_task_audit_times
        CHECK (
            updated_at >= created_at
            AND (published_at IS NULL OR (
                published_at >= created_at
                AND published_at <= updated_at))
            AND (opened_at IS NULL OR (
                published_at IS NOT NULL
                AND opened_at >= published_at
                AND opened_at <= updated_at))
            AND (closed_at IS NULL OR (
                closed_at >= created_at
                AND closed_at <= updated_at
                AND (opened_at IS NULL OR closed_at >= opened_at)))
        ),
    CONSTRAINT ck_task_state
        CHECK (
            (status = 'DRAFT'
                AND scheduled_open_at IS NULL
                AND scheduled_close_at IS NULL
                AND published_at IS NULL
                AND opened_at IS NULL
                AND closed_at IS NULL
                AND closure_type IS NULL)
            OR
            (status = 'SCHEDULED'
                AND scheduled_open_at IS NOT NULL
                AND scheduled_close_at IS NOT NULL
                AND published_at IS NOT NULL
                AND opened_at IS NULL
                AND closed_at IS NULL
                AND closure_type IS NULL)
            OR
            (status = 'OPEN'
                AND scheduled_open_at IS NOT NULL
                AND scheduled_close_at IS NOT NULL
                AND published_at IS NOT NULL
                AND opened_at IS NOT NULL
                AND closed_at IS NULL
                AND closure_type IS NULL)
            OR
            (status = 'CLOSED'
                AND closed_at IS NOT NULL
                AND closure_type IS NOT NULL
                AND (
                    (closure_type = 'CANCELLED'
                        AND (
                            (scheduled_open_at IS NULL
                                AND scheduled_close_at IS NULL
                                AND published_at IS NULL
                                AND opened_at IS NULL)
                            OR
                            (scheduled_open_at IS NOT NULL
                                AND scheduled_close_at IS NOT NULL
                                AND published_at IS NOT NULL)
                        ))
                    OR
                    (closure_type IN (
                            'DEADLINE_REACHED', 'EARLY_CLOSED')
                        AND scheduled_open_at IS NOT NULL
                        AND scheduled_close_at IS NOT NULL
                        AND published_at IS NOT NULL
                        AND opened_at IS NOT NULL)
                    OR
                    (closure_type = 'MISSED_SCHEDULE'
                        AND scheduled_open_at IS NOT NULL
                        AND scheduled_close_at IS NOT NULL
                        AND published_at IS NOT NULL
                        AND opened_at IS NULL)
                ))
        ),
    CONSTRAINT ck_task_closure_timing
        CHECK (
            closure_type IS NULL
            OR closure_type = 'CANCELLED'
            OR (closure_type = 'EARLY_CLOSED'
                AND closed_at < scheduled_close_at)
            OR (closure_type IN ('DEADLINE_REACHED', 'MISSED_SCHEDULE')
                AND closed_at >= scheduled_close_at)
        )
);

CREATE INDEX ix_task_status_schedule
    ON tasks (status, scheduled_open_at, scheduled_close_at);

CREATE TABLE task_questions (
    question_id uuid PRIMARY KEY,
    task_id uuid NOT NULL,
    type varchar(30) NOT NULL,
    content varchar(500) NOT NULL,
    description varchar(1000),
    display_order integer NOT NULL,
    minimum_selections integer,
    maximum_selections integer,
    text_max_length integer,
    number_minimum numeric(25, 6),
    number_maximum numeric(25, 6),
    decimal_allowed boolean,
    scale_minimum integer,
    scale_maximum integer,
    scale_minimum_label varchar(100),
    scale_maximum_label varchar(100),
    CONSTRAINT uq_task_question_ownership
        UNIQUE (question_id, task_id),
    CONSTRAINT uq_task_question_typed_ownership
        UNIQUE (question_id, task_id, type),
    CONSTRAINT uq_task_question_order
        UNIQUE (task_id, display_order),
    CONSTRAINT fk_task_question_task
        FOREIGN KEY (task_id)
        REFERENCES tasks (task_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_question_type
        CHECK (type IN (
            'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_TEXT',
            'LONG_TEXT', 'NUMBER', 'SCALE'
        )),
    CONSTRAINT ck_task_question_content
        CHECK (btrim(content) <> '' AND content = btrim(content)),
    CONSTRAINT ck_task_question_description
        CHECK (description IS NULL OR (
            btrim(description) <> '' AND description = btrim(description)
        )),
    CONSTRAINT ck_task_question_order
        CHECK (display_order > 0),
    CONSTRAINT ck_task_question_rules
        CHECK (
            (type = 'SINGLE_CHOICE'
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND text_max_length IS NULL
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL
                AND scale_minimum IS NULL
                AND scale_maximum IS NULL
                AND scale_minimum_label IS NULL
                AND scale_maximum_label IS NULL)
            OR
            (type = 'MULTIPLE_CHOICE'
                AND minimum_selections IS NOT NULL
                AND maximum_selections IS NOT NULL
                AND minimum_selections > 0
                AND maximum_selections >= minimum_selections
                AND maximum_selections <= 20
                AND text_max_length IS NULL
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL
                AND scale_minimum IS NULL
                AND scale_maximum IS NULL
                AND scale_minimum_label IS NULL
                AND scale_maximum_label IS NULL)
            OR
            (type = 'SHORT_TEXT'
                AND text_max_length BETWEEN 1 AND 500
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL
                AND scale_minimum IS NULL
                AND scale_maximum IS NULL
                AND scale_minimum_label IS NULL
                AND scale_maximum_label IS NULL)
            OR
            (type = 'LONG_TEXT'
                AND text_max_length BETWEEN 1 AND 5000
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL
                AND scale_minimum IS NULL
                AND scale_maximum IS NULL
                AND scale_minimum_label IS NULL
                AND scale_maximum_label IS NULL)
            OR
            (type = 'NUMBER'
                AND decimal_allowed IS NOT NULL
                AND (number_minimum IS NULL
                    OR number_maximum IS NULL
                    OR number_minimum <= number_maximum)
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND text_max_length IS NULL
                AND scale_minimum IS NULL
                AND scale_maximum IS NULL
                AND scale_minimum_label IS NULL
                AND scale_maximum_label IS NULL)
            OR
            (type = 'SCALE'
                AND scale_minimum IN (0, 1)
                AND scale_maximum BETWEEN 2 AND 10
                AND scale_maximum > scale_minimum
                AND minimum_selections IS NULL
                AND maximum_selections IS NULL
                AND text_max_length IS NULL
                AND number_minimum IS NULL
                AND number_maximum IS NULL
                AND decimal_allowed IS NULL)
        )
);

CREATE TABLE task_options (
    option_id uuid PRIMARY KEY,
    task_id uuid NOT NULL,
    question_id uuid NOT NULL,
    question_type varchar(30) NOT NULL,
    kind varchar(30) NOT NULL,
    content varchar(200) NOT NULL,
    display_order integer NOT NULL,
    CONSTRAINT uq_task_option_ownership
        UNIQUE (option_id, task_id, question_id),
    CONSTRAINT uq_task_option_typed_ownership
        UNIQUE (
            option_id, task_id, question_id, question_type, kind),
    CONSTRAINT uq_task_option_question_order
        UNIQUE (question_id, display_order),
    CONSTRAINT uq_task_option_question_content
        UNIQUE (question_id, content),
    CONSTRAINT fk_task_option_question
        FOREIGN KEY (question_id, task_id, question_type)
        REFERENCES task_questions (question_id, task_id, type)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_option_question_type
        CHECK (question_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE')),
    CONSTRAINT ck_task_option_kind
        CHECK (kind IN ('STANDARD', 'OTHER')),
    CONSTRAINT ck_task_option_content
        CHECK (btrim(content) <> '' AND content = btrim(content)),
    CONSTRAINT ck_task_option_order
        CHECK (display_order > 0)
);

CREATE UNIQUE INDEX uq_task_option_one_other_per_question
    ON task_options (question_id)
    WHERE kind = 'OTHER';

CREATE TABLE task_lifecycle_history (
    history_id uuid PRIMARY KEY,
    task_id uuid NOT NULL,
    event_type varchar(30) NOT NULL,
    previous_status varchar(30) NOT NULL,
    new_status varchar(30) NOT NULL,
    previous_scheduled_open_at timestamptz,
    previous_scheduled_close_at timestamptz,
    new_scheduled_open_at timestamptz,
    new_scheduled_close_at timestamptz,
    trigger varchar(30) NOT NULL,
    actor_id varchar(255),
    reason varchar(500),
    closure_type varchar(30),
    occurred_at timestamptz NOT NULL,
    CONSTRAINT fk_task_lifecycle_history_task
        FOREIGN KEY (task_id)
        REFERENCES tasks (task_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_lifecycle_event_type
        CHECK (event_type IN (
            'SCHEDULED', 'RESCHEDULED', 'OPENED', 'CLOSED', 'CANCELLED'
        )),
    CONSTRAINT ck_task_lifecycle_statuses
        CHECK (previous_status IN (
                'DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED')
            AND new_status IN (
                'DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED')),
    CONSTRAINT ck_task_lifecycle_previous_schedule
        CHECK (
            (previous_scheduled_open_at IS NULL
                AND previous_scheduled_close_at IS NULL)
            OR
            (previous_scheduled_open_at IS NOT NULL
                AND previous_scheduled_close_at IS NOT NULL
                AND previous_scheduled_open_at
                    < previous_scheduled_close_at)
        ),
    CONSTRAINT ck_task_lifecycle_new_schedule
        CHECK (
            (new_scheduled_open_at IS NULL
                AND new_scheduled_close_at IS NULL)
            OR
            (new_scheduled_open_at IS NOT NULL
                AND new_scheduled_close_at IS NOT NULL
                AND new_scheduled_open_at < new_scheduled_close_at)
        ),
    CONSTRAINT ck_task_lifecycle_trigger_actor
        CHECK (
            (trigger = 'ADMIN'
                AND actor_id IS NOT NULL
                AND btrim(actor_id) <> '')
            OR
            (trigger = 'SYSTEM' AND actor_id IS NULL)
        ),
    CONSTRAINT ck_task_lifecycle_reason
        CHECK (reason IS NULL OR (
            btrim(reason) <> '' AND reason = btrim(reason)
        )),
    CONSTRAINT ck_task_lifecycle_closure
        CHECK (
            (new_status = 'CLOSED'
                AND closure_type IN (
                    'DEADLINE_REACHED', 'EARLY_CLOSED',
                    'CANCELLED', 'MISSED_SCHEDULE'))
            OR
            (new_status <> 'CLOSED' AND closure_type IS NULL)
        )
);

CREATE INDEX ix_task_lifecycle_task_occurred
    ON task_lifecycle_history (task_id, occurred_at);

CREATE TABLE task_predictions (
    prediction_id uuid PRIMARY KEY,
    row_version bigint NOT NULL DEFAULT 0,
    user_id varchar(255) NOT NULL,
    task_id uuid NOT NULL,
    persona_generation_id uuid NOT NULL,
    persona_id varchar(512) NOT NULL,
    status varchar(30) NOT NULL,
    candidate_policy_version varchar(100) NOT NULL,
    requested_candidate_count integer NOT NULL,
    attempt_count integer NOT NULL,
    next_retry_at timestamptz,
    last_error_code varchar(200),
    last_error_message varchar(2000),
    created_at timestamptz NOT NULL,
    started_at timestamptz,
    completed_at timestamptz,
    CONSTRAINT uq_task_prediction_identity
        UNIQUE (user_id, task_id, persona_generation_id),
    CONSTRAINT uq_task_prediction_task
        UNIQUE (prediction_id, task_id),
    CONSTRAINT uq_task_prediction_submission_ownership
        UNIQUE (
            prediction_id, user_id, task_id, persona_generation_id),
    CONSTRAINT fk_task_prediction_task
        FOREIGN KEY (task_id)
        REFERENCES tasks (task_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_task_prediction_persona
        FOREIGN KEY (persona_generation_id, persona_id)
        REFERENCES persona_generations (generation_id, persona_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_prediction_row_version
        CHECK (row_version >= 0),
    CONSTRAINT ck_task_prediction_user
        CHECK (btrim(user_id) <> '' AND user_id = btrim(user_id)),
    CONSTRAINT ck_task_prediction_persona
        CHECK (btrim(persona_id) <> '' AND persona_id = btrim(persona_id)),
    CONSTRAINT ck_task_prediction_status
        CHECK (status IN (
            'PENDING', 'PROCESSING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED'
        )),
    CONSTRAINT ck_task_prediction_policy
        CHECK (btrim(candidate_policy_version) <> ''
            AND candidate_policy_version = btrim(candidate_policy_version)
            AND requested_candidate_count > 0),
    CONSTRAINT ck_task_prediction_attempt_count
        CHECK (attempt_count >= 0),
    CONSTRAINT ck_task_prediction_error
        CHECK (
            (last_error_code IS NULL OR (
                btrim(last_error_code) <> ''
                AND last_error_code = btrim(last_error_code)))
            AND (last_error_message IS NULL OR (
                btrim(last_error_message) <> ''
                AND last_error_message = btrim(last_error_message)))
        ),
    CONSTRAINT ck_task_prediction_timestamps
        CHECK (
            (started_at IS NULL OR started_at >= created_at)
            AND (completed_at IS NULL OR (
                started_at IS NOT NULL
                AND completed_at >= started_at))
        ),
    CONSTRAINT ck_task_prediction_state
        CHECK (
            (status = 'PENDING'
                AND attempt_count = 0
                AND next_retry_at IS NULL
                AND last_error_code IS NULL
                AND last_error_message IS NULL
                AND started_at IS NULL
                AND completed_at IS NULL)
            OR
            (status = 'PROCESSING'
                AND attempt_count > 0
                AND next_retry_at IS NULL
                AND last_error_code IS NULL
                AND last_error_message IS NULL
                AND started_at IS NOT NULL
                AND completed_at IS NULL)
            OR
            (status = 'RETRY_WAIT'
                AND attempt_count > 0
                AND next_retry_at IS NOT NULL
                AND last_error_code IS NOT NULL
                AND started_at IS NOT NULL
                AND completed_at IS NULL)
            OR
            (status = 'SUCCEEDED'
                AND attempt_count > 0
                AND next_retry_at IS NULL
                AND last_error_code IS NULL
                AND last_error_message IS NULL
                AND started_at IS NOT NULL
                AND completed_at IS NOT NULL)
            OR
            (status = 'FAILED'
                AND attempt_count > 0
                AND next_retry_at IS NULL
                AND last_error_code IS NOT NULL
                AND started_at IS NOT NULL
                AND completed_at IS NOT NULL)
        )
);

CREATE INDEX ix_task_prediction_dispatch
    ON task_predictions (status, next_retry_at, created_at);

CREATE INDEX ix_task_prediction_user_task
    ON task_predictions (user_id, task_id, created_at DESC);

CREATE TABLE task_prediction_candidates (
    candidate_id uuid PRIMARY KEY,
    prediction_id uuid NOT NULL,
    task_id uuid NOT NULL,
    question_id uuid NOT NULL,
    candidate_order integer NOT NULL,
    slot_option_id uuid,
    answer_type varchar(30) NOT NULL,
    text_value varchar(5000),
    number_value numeric(25, 6),
    scale_value integer,
    rationale varchar(500) NOT NULL,
    CONSTRAINT uq_task_prediction_candidate_ownership
        UNIQUE (candidate_id, prediction_id, task_id, question_id),
    CONSTRAINT uq_task_prediction_candidate_typed_ownership
        UNIQUE (
            candidate_id, prediction_id, task_id, question_id, answer_type),
    CONSTRAINT fk_task_prediction_candidate_prediction
        FOREIGN KEY (prediction_id, task_id)
        REFERENCES task_predictions (prediction_id, task_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_task_prediction_candidate_question
        FOREIGN KEY (question_id, task_id, answer_type)
        REFERENCES task_questions (question_id, task_id, type)
        ON DELETE RESTRICT,
    CONSTRAINT fk_task_prediction_candidate_slot
        FOREIGN KEY (slot_option_id, task_id, question_id)
        REFERENCES task_options (option_id, task_id, question_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_prediction_candidate_order
        CHECK (candidate_order > 0),
    CONSTRAINT ck_task_prediction_candidate_slot
        CHECK (
            (answer_type = 'SINGLE_CHOICE' AND slot_option_id IS NOT NULL)
            OR
            (answer_type <> 'SINGLE_CHOICE' AND slot_option_id IS NULL)
        ),
    CONSTRAINT ck_task_prediction_candidate_rationale
        CHECK (btrim(rationale) <> '' AND rationale = btrim(rationale)),
    CONSTRAINT ck_task_prediction_candidate_value
        CHECK (
            (answer_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE')
                AND text_value IS NULL
                AND number_value IS NULL
                AND scale_value IS NULL)
            OR
            (answer_type IN ('SHORT_TEXT', 'LONG_TEXT')
                AND text_value IS NOT NULL
                AND btrim(text_value) <> ''
                AND text_value = btrim(text_value)
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

CREATE UNIQUE INDEX uq_task_prediction_candidate_question_order
    ON task_prediction_candidates (
        prediction_id, question_id, candidate_order)
    WHERE slot_option_id IS NULL;

CREATE UNIQUE INDEX uq_task_prediction_candidate_option_order
    ON task_prediction_candidates (
        prediction_id, question_id, slot_option_id, candidate_order)
    WHERE slot_option_id IS NOT NULL;

CREATE TABLE task_prediction_candidate_selections (
    selection_id uuid PRIMARY KEY,
    candidate_id uuid NOT NULL,
    prediction_id uuid NOT NULL,
    task_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answer_type varchar(30) NOT NULL,
    option_id uuid NOT NULL,
    option_kind varchar(30) NOT NULL,
    other_text varchar(500),
    CONSTRAINT uq_task_prediction_candidate_selection
        UNIQUE (candidate_id, option_id),
    CONSTRAINT fk_task_candidate_selection_candidate
        FOREIGN KEY (
            candidate_id, prediction_id, task_id, question_id, answer_type)
        REFERENCES task_prediction_candidates (
            candidate_id, prediction_id, task_id, question_id, answer_type)
        ON DELETE RESTRICT,
    CONSTRAINT fk_task_candidate_selection_option
        FOREIGN KEY (
            option_id, task_id, question_id, answer_type, option_kind)
        REFERENCES task_options (
            option_id, task_id, question_id, question_type, kind)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_candidate_selection_answer_type
        CHECK (answer_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE')),
    CONSTRAINT ck_task_candidate_selection_other_text
        CHECK (
            (option_kind = 'STANDARD' AND other_text IS NULL)
            OR
            (option_kind = 'OTHER'
                AND other_text IS NOT NULL
                AND btrim(other_text) <> ''
                AND other_text = btrim(other_text))
        )
);

CREATE TABLE task_prediction_attempts (
    attempt_id uuid PRIMARY KEY,
    prediction_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    request_id uuid NOT NULL,
    request_payload jsonb NOT NULL,
    requested_at timestamptz NOT NULL,
    responded_at timestamptz,
    outcome varchar(40) NOT NULL,
    http_status integer,
    response_payload jsonb,
    error_code varchar(200),
    error_message varchar(2000),
    CONSTRAINT uq_task_prediction_attempt_number
        UNIQUE (prediction_id, attempt_number),
    CONSTRAINT fk_task_prediction_attempt_prediction
        FOREIGN KEY (prediction_id)
        REFERENCES task_predictions (prediction_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_prediction_attempt_number
        CHECK (attempt_number > 0),
    CONSTRAINT ck_task_prediction_attempt_request_id
        CHECK (request_id = prediction_id),
    CONSTRAINT ck_task_prediction_attempt_outcome
        CHECK (outcome IN (
            'IN_PROGRESS', 'SUCCEEDED', 'TIMEOUT', 'NETWORK_ERROR',
            'HTTP_ERROR', 'INVALID_RESPONSE', 'IGNORED_LATE_RESPONSE'
        )),
    CONSTRAINT ck_task_prediction_attempt_http_status
        CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
    CONSTRAINT ck_task_prediction_attempt_error
        CHECK (
            (error_code IS NULL OR (
                btrim(error_code) <> '' AND error_code = btrim(error_code)))
            AND (error_message IS NULL OR (
                btrim(error_message) <> ''
                AND error_message = btrim(error_message)))
        ),
    CONSTRAINT ck_task_prediction_attempt_state
        CHECK (
            (outcome = 'IN_PROGRESS'
                AND responded_at IS NULL
                AND http_status IS NULL
                AND response_payload IS NULL
                AND error_code IS NULL
                AND error_message IS NULL)
            OR
            (outcome = 'SUCCEEDED'
                AND responded_at >= requested_at
                AND response_payload IS NOT NULL
                AND error_code IS NULL
                AND error_message IS NULL)
            OR
            (outcome NOT IN ('IN_PROGRESS', 'SUCCEEDED')
                AND responded_at >= requested_at)
        )
);

CREATE TABLE task_submissions (
    submission_id uuid PRIMARY KEY,
    user_id varchar(255) NOT NULL,
    task_id uuid NOT NULL,
    persona_generation_id uuid NOT NULL,
    prediction_id uuid NOT NULL,
    submitted_at timestamptz NOT NULL,
    CONSTRAINT uq_task_submission_user_task
        UNIQUE (user_id, task_id),
    CONSTRAINT uq_task_submission_ownership
        UNIQUE (submission_id, task_id, prediction_id),
    CONSTRAINT uq_task_submission_receipt_ownership
        UNIQUE (submission_id, user_id),
    CONSTRAINT fk_task_submission_task
        FOREIGN KEY (task_id)
        REFERENCES tasks (task_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_task_submission_prediction
        FOREIGN KEY (
            prediction_id, user_id, task_id, persona_generation_id)
        REFERENCES task_predictions (
            prediction_id, user_id, task_id, persona_generation_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_submission_user
        CHECK (btrim(user_id) <> '' AND user_id = btrim(user_id))
);

CREATE INDEX ix_task_submission_user_submitted
    ON task_submissions (user_id, submitted_at DESC);

CREATE TABLE task_submission_answers (
    submission_id uuid NOT NULL,
    task_id uuid NOT NULL,
    prediction_id uuid NOT NULL,
    question_id uuid NOT NULL,
    source varchar(30) NOT NULL,
    adopted_candidate_id uuid,
    answer_type varchar(30) NOT NULL,
    text_value varchar(5000),
    number_value numeric(25, 6),
    scale_value integer,
    PRIMARY KEY (submission_id, question_id),
    CONSTRAINT uq_task_submission_answer_ownership
        UNIQUE (submission_id, task_id, prediction_id, question_id),
    CONSTRAINT uq_task_submission_answer_typed_ownership
        UNIQUE (
            submission_id, task_id, prediction_id,
            question_id, answer_type),
    CONSTRAINT fk_task_submission_answer_submission
        FOREIGN KEY (submission_id, task_id, prediction_id)
        REFERENCES task_submissions (
            submission_id, task_id, prediction_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_task_submission_answer_question
        FOREIGN KEY (question_id, task_id, answer_type)
        REFERENCES task_questions (question_id, task_id, type)
        ON DELETE RESTRICT,
    CONSTRAINT fk_task_submission_answer_candidate
        FOREIGN KEY (
            adopted_candidate_id, prediction_id, task_id, question_id)
        REFERENCES task_prediction_candidates (
            candidate_id, prediction_id, task_id, question_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_submission_answer_source
        CHECK (
            (source = 'AI_ACCEPTED' AND adopted_candidate_id IS NOT NULL)
            OR
            (source = 'USER_ANSWERED' AND adopted_candidate_id IS NULL)
        ),
    CONSTRAINT ck_task_submission_answer_value
        CHECK (
            (answer_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE')
                AND text_value IS NULL
                AND number_value IS NULL
                AND scale_value IS NULL)
            OR
            (answer_type IN ('SHORT_TEXT', 'LONG_TEXT')
                AND text_value IS NOT NULL
                AND btrim(text_value) <> ''
                AND text_value = btrim(text_value)
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

CREATE TABLE task_submission_answer_selections (
    submission_id uuid NOT NULL,
    task_id uuid NOT NULL,
    prediction_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answer_type varchar(30) NOT NULL,
    option_id uuid NOT NULL,
    option_kind varchar(30) NOT NULL,
    other_text varchar(500),
    PRIMARY KEY (submission_id, question_id, option_id),
    CONSTRAINT fk_task_submission_selection_answer
        FOREIGN KEY (
            submission_id, task_id, prediction_id,
            question_id, answer_type)
        REFERENCES task_submission_answers (
            submission_id, task_id, prediction_id,
            question_id, answer_type)
        ON DELETE RESTRICT,
    CONSTRAINT fk_task_submission_selection_option
        FOREIGN KEY (
            option_id, task_id, question_id, answer_type, option_kind)
        REFERENCES task_options (
            option_id, task_id, question_id, question_type, kind)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_submission_selection_answer_type
        CHECK (answer_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE')),
    CONSTRAINT ck_task_submission_selection_other_text
        CHECK (
            (option_kind = 'STANDARD' AND other_text IS NULL)
            OR
            (option_kind = 'OTHER'
                AND other_text IS NOT NULL
                AND btrim(other_text) <> ''
                AND other_text = btrim(other_text))
        )
);

CREATE TABLE task_submission_receipts (
    receipt_id uuid PRIMARY KEY,
    user_id varchar(255) NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash bytea NOT NULL,
    status varchar(30) NOT NULL,
    outcome_schema_version integer NOT NULL,
    http_status integer,
    outcome jsonb,
    submission_id uuid,
    created_at timestamptz NOT NULL,
    completed_at timestamptz,
    expires_at timestamptz,
    CONSTRAINT uq_task_submission_receipt_key
        UNIQUE (user_id, idempotency_key),
    CONSTRAINT fk_task_submission_receipt_submission
        FOREIGN KEY (submission_id, user_id)
        REFERENCES task_submissions (submission_id, user_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_task_submission_receipt_user
        CHECK (btrim(user_id) <> '' AND user_id = btrim(user_id)),
    CONSTRAINT ck_task_submission_receipt_hash
        CHECK (octet_length(request_hash) = 32),
    CONSTRAINT ck_task_submission_receipt_status
        CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'REJECTED')),
    CONSTRAINT ck_task_submission_receipt_schema_version
        CHECK (outcome_schema_version > 0),
    CONSTRAINT ck_task_submission_receipt_expiry
        CHECK (expires_at IS NULL OR expires_at > created_at),
    CONSTRAINT ck_task_submission_receipt_outcome
        CHECK (
            (status = 'PROCESSING'
                AND http_status IS NULL
                AND outcome IS NULL
                AND submission_id IS NULL
                AND completed_at IS NULL)
            OR
            (status = 'SUCCEEDED'
                AND http_status BETWEEN 200 AND 299
                AND outcome IS NOT NULL
                AND submission_id IS NOT NULL
                AND completed_at IS NOT NULL
                AND completed_at >= created_at)
            OR
            (status = 'REJECTED'
                AND http_status BETWEEN 400 AND 499
                AND outcome IS NOT NULL
                AND submission_id IS NULL
                AND completed_at IS NOT NULL
                AND completed_at >= created_at)
        )
);

CREATE INDEX ix_task_submission_receipt_expiry
    ON task_submission_receipts (expires_at)
    WHERE expires_at IS NOT NULL;
