package com.hamcheeze.vote.shared.integration.task;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record TaskSubmissionCompletedV1(
        String userId,
        UUID submissionId,
        UUID taskId,
        UUID predictionId,
        UUID personaGenerationId,
        UUID personaVersionId,
        Instant submittedAt,
        List<AnswerV1> answers
) {

    public static final String EVENT_TYPE = "task.submission-completed";
    public static final String AGGREGATE_TYPE = "TASK_SUBMISSION";
    public static final int SCHEMA_VERSION = 1;

    public TaskSubmissionCompletedV1 {
        userId = requireText(userId, "userId");
        Objects.requireNonNull(submissionId, "submissionId");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(predictionId, "predictionId");
        Objects.requireNonNull(personaGenerationId, "personaGenerationId");
        Objects.requireNonNull(personaVersionId, "personaVersionId");
        Objects.requireNonNull(submittedAt, "submittedAt");
        answers = List.copyOf(Objects.requireNonNull(answers, "answers"));
        if (answers.isEmpty()) {
            throw new IllegalArgumentException("answers must not be empty");
        }
        if (answers.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "answers must not contain null");
        }
    }

    public record AnswerV1(
            UUID questionId,
            AnswerType answerType,
            AnswerSource source,
            UUID adoptedPredictionCandidateId,
            String textValue,
            BigDecimal numberValue,
            Integer scaleValue,
            List<SelectionV1> selections
    ) {

        public AnswerV1 {
            Objects.requireNonNull(questionId, "questionId");
            Objects.requireNonNull(answerType, "answerType");
            Objects.requireNonNull(source, "source");
            selections = List.copyOf(Objects.requireNonNull(
                    selections, "selections"));
            if (selections.stream().anyMatch(Objects::isNull)) {
                throw new IllegalArgumentException(
                        "selections must not contain null");
            }
            if (source == AnswerSource.AI_ACCEPTED
                    && adoptedPredictionCandidateId == null) {
                throw new IllegalArgumentException(
                        "AI_ACCEPTED answer requires candidate ID");
            }
            if (source == AnswerSource.USER_ANSWERED
                    && adoptedPredictionCandidateId != null) {
                throw new IllegalArgumentException(
                        "USER_ANSWERED answer must not have candidate ID");
            }
            validateValueShape(
                    answerType, textValue, numberValue, scaleValue,
                    selections);
        }

        private static void validateValueShape(
                AnswerType answerType,
                String textValue,
                BigDecimal numberValue,
                Integer scaleValue,
                List<SelectionV1> selections
        ) {
            boolean text = textValue != null;
            boolean number = numberValue != null;
            boolean scale = scaleValue != null;
            boolean selected = !selections.isEmpty();
            boolean valid = switch (answerType) {
                case SINGLE_CHOICE -> selected
                        && selections.size() == 1
                        && !text && !number && !scale;
                case MULTIPLE_CHOICE -> selected
                        && !text && !number && !scale;
                case SHORT_TEXT, LONG_TEXT -> text
                        && !number && !scale && !selected;
                case NUMBER -> number
                        && !text && !scale && !selected;
                case SCALE -> scale
                        && !text && !number && !selected;
            };
            if (!valid) {
                throw new IllegalArgumentException(
                        "answer value does not match answerType");
            }
        }
    }

    public record SelectionV1(UUID optionId, String otherText) {
        public SelectionV1 {
            Objects.requireNonNull(optionId, "optionId");
        }
    }

    public enum AnswerType {
        SINGLE_CHOICE,
        MULTIPLE_CHOICE,
        SHORT_TEXT,
        LONG_TEXT,
        NUMBER,
        SCALE
    }

    public enum AnswerSource {
        AI_ACCEPTED,
        USER_ANSWERED
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        if (!value.equals(value.strip())) {
            throw new IllegalArgumentException(
                    field + " must not contain surrounding whitespace");
        }
        return value;
    }
}
