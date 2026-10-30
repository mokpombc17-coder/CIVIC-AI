package com.hamcheeze.vote.task.application.result;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Provider-neutral structured output produced from task-result-for-llm/v1.
 */
public record OpinionMapOptionExplanationV1(
        String schemaVersion,
        UUID taskId,
        Integer resultVersion,
        GenerationStatus status,
        String error,
        List<OptionSummary> optionSummaries
) {

    public static final String SCHEMA_VERSION =
            "opinionmap-option-explanation/v1";
    public static final String JSON_SCHEMA_RESOURCE =
            "schemas/opinionmap-option-explanation-v1.schema.json";

    public OpinionMapOptionExplanationV1 {
        schemaVersion = requireText(schemaVersion, "schemaVersion");
        if (!SCHEMA_VERSION.equals(schemaVersion)) {
            throw new IllegalArgumentException(
                    "schemaVersion is unsupported");
        }
        Objects.requireNonNull(status, "status");
        optionSummaries = List.copyOf(Objects.requireNonNull(
                optionSummaries, "optionSummaries"));

        if (resultVersion != null && resultVersion < 1) {
            throw new IllegalArgumentException(
                    "resultVersion must be positive when present");
        }

        if (status == GenerationStatus.COMPLETED) {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(resultVersion, "resultVersion");
            if (error != null) {
                throw new IllegalArgumentException(
                        "error must be null when status is COMPLETED");
            }
            if (optionSummaries.isEmpty()) {
                throw new IllegalArgumentException(
                        "optionSummaries must not be empty when completed");
            }
        } else {
            error = requireText(error, "error");
            if (!optionSummaries.isEmpty()) {
                throw new IllegalArgumentException(
                        "optionSummaries must be empty for invalid input");
            }
        }

        validateUniqueOptionKeys(optionSummaries);
    }

    /**
     * Verifies identifiers, option coverage, ordering, and response-dependent
     * states against the exact LLM input projection.
     */
    public void validateAgainst(TaskResultForLlmV1 input) {
        Objects.requireNonNull(input, "input");
        if (taskId != null && !taskId.equals(input.taskId().value())) {
            throw new IllegalArgumentException(
                    "taskId does not match the LLM input");
        }
        if (resultVersion != null
                && resultVersion != input.resultVersion()) {
            throw new IllegalArgumentException(
                    "resultVersion does not match the LLM input");
        }
        if (status == GenerationStatus.INVALID_INPUT) {
            return;
        }

        List<String> expectedOptionKeys = input.options().stream()
                .map(TaskResultForLlmV1.OptionData::key)
                .toList();
        List<String> actualOptionKeys = optionSummaries.stream()
                .map(OptionSummary::optionKey)
                .toList();
        if (!actualOptionKeys.equals(expectedOptionKeys)) {
            throw new IllegalArgumentException(
                    "optionSummaries must cover input options in display order");
        }

        Map<String, Integer> responseCounts = responseCounts(input);
        for (OptionSummary summary : optionSummaries) {
            int sameChoiceResponses = responseCounts.get(summary.optionKey());
            int otherChoiceResponses = input.responses().size()
                    - sameChoiceResponses;
            validateResponseState(
                    summary.sameChoice(), sameChoiceResponses, "sameChoice");
            validateResponseState(
                    summary.otherChoices(), otherChoiceResponses,
                    "otherChoices");
            validateSourceOptionKeys(
                    summary, expectedOptionKeys, responseCounts);
        }
    }

    private static Map<String, Integer> responseCounts(
            TaskResultForLlmV1 input
    ) {
        Map<String, Integer> counts = new HashMap<>();
        input.options().forEach(option -> counts.put(option.key(), 0));
        input.responses().forEach(response -> counts.compute(
                response.selectedOptionKey(),
                (key, count) -> Objects.requireNonNull(count) + 1));
        return counts;
    }

    private static void validateResponseState(
            AreaSummary summary,
            int responseCount,
            String field
    ) {
        if (responseCount == 0
                && summary.status() != AreaStatus.NO_RESPONSES) {
            throw new IllegalArgumentException(
                    field + " must be NO_RESPONSES when no responses exist");
        }
        if (responseCount > 0
                && summary.status() == AreaStatus.NO_RESPONSES) {
            throw new IllegalArgumentException(
                    field + " must not be NO_RESPONSES when responses exist");
        }
    }

    private static void validateSourceOptionKeys(
            OptionSummary summary,
            List<String> expectedOptionKeys,
            Map<String, Integer> responseCounts
    ) {
        validateSourceOptionKeys(
                summary.sameChoice(), summary.optionKey(), true,
                expectedOptionKeys, responseCounts);
        validateSourceOptionKeys(
                summary.otherChoices(), summary.optionKey(), false,
                expectedOptionKeys, responseCounts);
    }

    private static void validateSourceOptionKeys(
            AreaSummary area,
            String optionKey,
            boolean sameChoice,
            List<String> expectedOptionKeys,
            Map<String, Integer> responseCounts
    ) {
        if (area.status() != AreaStatus.AVAILABLE) {
            return;
        }
        List<String> expectedOrder = expectedOptionKeys.stream()
                .filter(area.sourceOptionKeys()::contains)
                .toList();
        if (!area.sourceOptionKeys().equals(expectedOrder)) {
            throw new IllegalArgumentException(
                    "sourceOptionKeys must follow input display order");
        }
        for (String sourceOptionKey : area.sourceOptionKeys()) {
            if (!responseCounts.containsKey(sourceOptionKey)) {
                throw new IllegalArgumentException(
                        "sourceOptionKey does not exist in the LLM input");
            }
            if (responseCounts.get(sourceOptionKey) == 0) {
                throw new IllegalArgumentException(
                        "sourceOptionKey must have at least one response");
            }
            if (sameChoice != sourceOptionKey.equals(optionKey)) {
                throw new IllegalArgumentException(
                        "sourceOptionKey is in the wrong summary area");
            }
        }
    }

    private static void validateUniqueOptionKeys(
            List<OptionSummary> optionSummaries
    ) {
        Set<String> keys = new HashSet<>();
        for (OptionSummary summary : optionSummaries) {
            Objects.requireNonNull(summary, "optionSummary");
            if (!keys.add(summary.optionKey())) {
                throw new IllegalArgumentException(
                        "optionSummaries must use unique option keys");
            }
        }
    }

    public record OptionSummary(
            String optionKey,
            AreaSummary sameChoice,
            AreaSummary otherChoices
    ) {

        public OptionSummary {
            optionKey = requireText(optionKey, "optionKey");
            Objects.requireNonNull(sameChoice, "sameChoice");
            Objects.requireNonNull(otherChoices, "otherChoices");
            if (sameChoice.status() == AreaStatus.AVAILABLE
                    && !sameChoice.sourceOptionKeys().equals(
                    List.of(optionKey))) {
                throw new IllegalArgumentException(
                        "available sameChoice must use its option key only");
            }
            if (otherChoices.status() == AreaStatus.AVAILABLE
                    && otherChoices.sourceOptionKeys().contains(optionKey)) {
                throw new IllegalArgumentException(
                        "otherChoices must exclude its option key");
            }
        }
    }

    public record AreaSummary(
            AreaStatus status,
            List<String> sourceOptionKeys,
            String body
    ) {

        public AreaSummary {
            Objects.requireNonNull(status, "status");
            sourceOptionKeys = normalizeKeys(sourceOptionKeys);
            if (status == AreaStatus.AVAILABLE) {
                if (sourceOptionKeys.isEmpty()) {
                    throw new IllegalArgumentException(
                            "sourceOptionKeys must not be empty when available");
                }
                body = requireText(body, "body");
            } else {
                if (!sourceOptionKeys.isEmpty()) {
                    throw new IllegalArgumentException(
                            "sourceOptionKeys must be empty when unavailable");
                }
                if (body != null) {
                    throw new IllegalArgumentException(
                            "body must be null when unavailable");
                }
            }
        }

        private static List<String> normalizeKeys(List<String> keys) {
            List<String> normalized = Objects.requireNonNull(
                            keys, "sourceOptionKeys")
                    .stream()
                    .map(key -> requireText(key, "sourceOptionKey"))
                    .toList();
            Set<String> unique = new HashSet<>();
            for (String key : normalized) {
                if (!unique.add(key)) {
                    throw new IllegalArgumentException(
                            "sourceOptionKeys must not contain duplicates");
                }
            }
            return normalized;
        }
    }

    public enum GenerationStatus {
        COMPLETED,
        INVALID_INPUT
    }

    public enum AreaStatus {
        AVAILABLE,
        NO_RESPONSES,
        INSUFFICIENT_REASON
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
