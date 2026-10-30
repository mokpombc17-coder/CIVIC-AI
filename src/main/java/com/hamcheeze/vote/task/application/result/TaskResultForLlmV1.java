package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.common.TaskId;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/** Provider-neutral, anonymous task result projection for LLM analysis. */
public record TaskResultForLlmV1(
        TaskId taskId,
        String sourceSchemaVersion,
        int resultVersion,
        String sourceBodySha256,
        TaskData task,
        QuestionData question,
        List<OptionData> options,
        List<ResponseData> responses
) {

    public static final String SCHEMA_VERSION = "task-result-for-llm/v1";
    private static final Pattern LOWERCASE_SHA_256 =
            Pattern.compile("[0-9a-f]{64}");

    public TaskResultForLlmV1 {
        Objects.requireNonNull(taskId, "taskId");
        sourceSchemaVersion = requireText(
                sourceSchemaVersion, "sourceSchemaVersion");
        if (!TaskResultViewV1.SCHEMA_VERSION.equals(sourceSchemaVersion)) {
            throw new IllegalArgumentException(
                    "sourceSchemaVersion is unsupported");
        }
        if (resultVersion < 1) {
            throw new IllegalArgumentException(
                    "resultVersion must be positive");
        }
        sourceBodySha256 = requireText(
                sourceBodySha256, "sourceBodySha256");
        if (!LOWERCASE_SHA_256.matcher(sourceBodySha256).matches()) {
            throw new IllegalArgumentException(
                    "sourceBodySha256 must be lowercase SHA-256 hex");
        }
        Objects.requireNonNull(task, "task");
        Objects.requireNonNull(question, "question");
        options = List.copyOf(Objects.requireNonNull(options, "options"));
        responses = List.copyOf(Objects.requireNonNull(
                responses, "responses"));
        validateOptions(options);
        validateResponses(options, responses);
    }

    private static void validateOptions(List<OptionData> options) {
        if (options.isEmpty()) {
            throw new IllegalArgumentException("options must not be empty");
        }
        Set<String> keys = new HashSet<>();
        for (int index = 0; index < options.size(); index++) {
            OptionData option = Objects.requireNonNull(
                    options.get(index), "option");
            if (option.displayOrder() != index + 1) {
                throw new IllegalArgumentException(
                        "options must use continuous display order from 1");
            }
            if (!keys.add(option.key())) {
                throw new IllegalArgumentException(
                        "options must use unique keys");
            }
        }
    }

    private static void validateResponses(
            List<OptionData> options,
            List<ResponseData> responses
    ) {
        Set<String> optionKeys = new HashSet<>();
        options.forEach(option -> optionKeys.add(option.key()));
        Set<String> responseRefs = new HashSet<>();
        for (ResponseData response : responses) {
            Objects.requireNonNull(response, "response");
            if (!responseRefs.add(response.responseRef())) {
                throw new IllegalArgumentException(
                        "responses must use unique references");
            }
            if (!optionKeys.contains(response.selectedOptionKey())) {
                throw new IllegalArgumentException(
                        "response selected option must exist");
            }
        }
    }

    public record OptionData(
            String key,
            int displayOrder,
            String content
    ) {

        public OptionData {
            key = requireText(key, "key");
            if (displayOrder < 1) {
                throw new IllegalArgumentException(
                        "displayOrder must be positive");
            }
            content = requireText(content, "content");
        }
    }

    public record ResponseData(
            String responseRef,
            String selectedOptionKey,
            String reason
    ) {

        public ResponseData {
            responseRef = requireText(responseRef, "responseRef");
            selectedOptionKey = requireText(
                    selectedOptionKey, "selectedOptionKey");
            reason = requireText(reason, "reason");
        }
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return normalized;
    }
}
