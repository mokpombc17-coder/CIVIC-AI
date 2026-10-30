CREATE TABLE result_submissions (
    submission_id uuid PRIMARY KEY,
    user_id varchar(255) NOT NULL,
    task_id uuid NOT NULL,
    prediction_id uuid NOT NULL,
    persona_generation_id uuid NOT NULL,
    persona_version_id uuid NOT NULL,
    submitted_at timestamptz NOT NULL,
    submitted_answer_count integer NOT NULL,
    ai_accepted_answer_count integer NOT NULL,
    CONSTRAINT uq_result_submission_user_task
        UNIQUE (user_id, task_id),
    CONSTRAINT ck_result_submission_user
        CHECK (btrim(user_id) <> '' AND user_id = btrim(user_id)),
    CONSTRAINT ck_result_submission_answer_counts
        CHECK (
            submitted_answer_count > 0
            AND ai_accepted_answer_count >= 0
            AND ai_accepted_answer_count <= submitted_answer_count
        )
);

CREATE INDEX ix_result_submission_task
    ON result_submissions (task_id, submitted_at, submission_id);

CREATE INDEX ix_result_submission_persona_version
    ON result_submissions (
        persona_version_id, submitted_at, submission_id);

CREATE TABLE result_submission_answers (
    submission_id uuid NOT NULL,
    question_id uuid NOT NULL,
    source varchar(30) NOT NULL,
    adopted_prediction_candidate_id uuid,
    answer_type varchar(30) NOT NULL,
    text_value varchar(5000),
    number_value numeric(25, 6),
    scale_value integer,
    PRIMARY KEY (submission_id, question_id),
    CONSTRAINT uq_result_submission_answer_typed
        UNIQUE (submission_id, question_id, answer_type),
    CONSTRAINT fk_result_submission_answer_submission
        FOREIGN KEY (submission_id)
        REFERENCES result_submissions (submission_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_result_submission_answer_source
        CHECK (
            (source = 'AI_ACCEPTED'
                AND adopted_prediction_candidate_id IS NOT NULL)
            OR
            (source = 'USER_ANSWERED'
                AND adopted_prediction_candidate_id IS NULL)
        ),
    CONSTRAINT ck_result_submission_answer_value
        CHECK (
            (answer_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE')
                AND text_value IS NULL
                AND number_value IS NULL
                AND scale_value IS NULL)
            OR
            (answer_type IN ('SHORT_TEXT', 'LONG_TEXT')
                AND text_value IS NOT NULL
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

CREATE TABLE result_submission_answer_selections (
    submission_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answer_type varchar(30) NOT NULL,
    option_id uuid NOT NULL,
    other_text varchar(500),
    PRIMARY KEY (submission_id, question_id, option_id),
    CONSTRAINT fk_result_submission_selection_answer
        FOREIGN KEY (submission_id, question_id, answer_type)
        REFERENCES result_submission_answers (
            submission_id, question_id, answer_type)
        ON DELETE RESTRICT,
    CONSTRAINT ck_result_submission_selection_type
        CHECK (answer_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE'))
);

INSERT INTO result_submissions (
    submission_id,
    user_id,
    task_id,
    prediction_id,
    persona_generation_id,
    persona_version_id,
    submitted_at,
    submitted_answer_count,
    ai_accepted_answer_count)
SELECT
    (payload::jsonb ->> 'submissionId')::uuid,
    payload::jsonb ->> 'userId',
    (payload::jsonb ->> 'taskId')::uuid,
    (payload::jsonb ->> 'predictionId')::uuid,
    (payload::jsonb ->> 'personaGenerationId')::uuid,
    (payload::jsonb ->> 'personaVersionId')::uuid,
    (payload::jsonb ->> 'submittedAt')::timestamptz,
    jsonb_array_length(payload::jsonb -> 'answers'),
    (
        SELECT count(*)::integer
        FROM jsonb_array_elements(
            payload::jsonb -> 'answers') AS answer
        WHERE answer ->> 'source' = 'AI_ACCEPTED'
    )
FROM result_inbox
WHERE consumer_name = 'result-task-submission-completed-v1'
  AND event_type = 'task.submission-completed'
  AND schema_version = 1
ON CONFLICT (submission_id) DO NOTHING;

INSERT INTO result_submission_answers (
    submission_id,
    question_id,
    source,
    adopted_prediction_candidate_id,
    answer_type,
    text_value,
    number_value,
    scale_value)
SELECT
    (inbox.payload::jsonb ->> 'submissionId')::uuid,
    (answer ->> 'questionId')::uuid,
    answer ->> 'source',
    (answer ->> 'adoptedPredictionCandidateId')::uuid,
    answer ->> 'answerType',
    answer ->> 'textValue',
    (answer ->> 'numberValue')::numeric(25, 6),
    (answer ->> 'scaleValue')::integer
FROM result_inbox AS inbox
CROSS JOIN LATERAL jsonb_array_elements(
    inbox.payload::jsonb -> 'answers') AS answer
WHERE inbox.consumer_name = 'result-task-submission-completed-v1'
  AND inbox.event_type = 'task.submission-completed'
  AND inbox.schema_version = 1
ON CONFLICT (submission_id, question_id) DO NOTHING;

INSERT INTO result_submission_answer_selections (
    submission_id,
    question_id,
    answer_type,
    option_id,
    other_text)
SELECT
    (inbox.payload::jsonb ->> 'submissionId')::uuid,
    (answer ->> 'questionId')::uuid,
    answer ->> 'answerType',
    (selection ->> 'optionId')::uuid,
    selection ->> 'otherText'
FROM result_inbox AS inbox
CROSS JOIN LATERAL jsonb_array_elements(
    inbox.payload::jsonb -> 'answers') AS answer
CROSS JOIN LATERAL jsonb_array_elements(
    answer -> 'selections') AS selection
WHERE inbox.consumer_name = 'result-task-submission-completed-v1'
  AND inbox.event_type = 'task.submission-completed'
  AND inbox.schema_version = 1
ON CONFLICT (submission_id, question_id, option_id) DO NOTHING;
