package com.hamcheeze.vote.security;

public final class VoteScopes {

    public static final String SURVEYS_READ =
            "vote:surveys:read";
    public static final String SURVEY_RESPONSES_WRITE =
            "vote:survey-responses:write";
    public static final String SURVEY_OUTBOX_REPLAYS_WRITE =
            "vote:survey-outbox-replays:write";
    public static final String PERSONA_GENERATION_RETRIES_WRITE =
            "vote:persona-generation-retries:write";
    public static final String PERSONAS_READ =
            "vote:personas:read";
    public static final String TASKS_READ =
            "vote:tasks:read";
    public static final String TASKS_ADMIN =
            "vote:tasks:admin";
    public static final String PREDICTIONS_WRITE =
            "vote:predictions:write";
    public static final String SUBMISSIONS_READ =
            "vote:submissions:read";
    public static final String SUBMISSIONS_WRITE =
            "vote:submissions:write";
    public static final String TASK_OUTCOMES_READ =
            "vote:task-outcomes:read";
    public static final String TASK_PREPARATIONS_WRITE =
            "vote:task-preparations:write";

    private static final String AUTHORITY_PREFIX = "SCOPE_";

    private VoteScopes() {
    }

    public static String authority(String scope) {
        return AUTHORITY_PREFIX + scope;
    }
}
