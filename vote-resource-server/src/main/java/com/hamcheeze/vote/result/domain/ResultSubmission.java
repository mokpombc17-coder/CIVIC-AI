package com.hamcheeze.vote.result.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record ResultSubmission(
        UUID submissionId,
        String userId,
        UUID taskId,
        UUID predictionId,
        UUID personaGenerationId,
        UUID personaVersionId,
        Instant submittedAt,
        List<ResultSubmissionAnswer> answers
) {

    public ResultSubmission {
        Objects.requireNonNull(submissionId, "submissionId");
        userId = requireText(userId, "userId");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(predictionId, "predictionId");
        Objects.requireNonNull(
                personaGenerationId, "personaGenerationId");
        Objects.requireNonNull(personaVersionId, "personaVersionId");
        Objects.requireNonNull(submittedAt, "submittedAt");
        submittedAt = submittedAt.truncatedTo(ChronoUnit.MICROS);
        Objects.requireNonNull(answers, "answers");
        if (answers.isEmpty()) {
            throw new IllegalArgumentException("answers must not be empty");
        }
        if (answers.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "answers must not contain null");
        }
        answers = answers.stream()
                .sorted(Comparator.comparing(
                        ResultSubmissionAnswer::questionId))
                .toList();
        if (new HashSet<>(answers.stream()
                .map(ResultSubmissionAnswer::questionId)
                .toList()).size() != answers.size()) {
            throw new IllegalArgumentException(
                    "answers must not contain duplicate questionId");
        }
    }

    public int submittedAnswerCount() {
        return answers.size();
    }

    public int aiAcceptedAnswerCount() {
        return (int) answers.stream()
                .filter(answer -> answer.source()
                        == ResultAnswerSource.AI_ACCEPTED)
                .count();
    }

    public BigDecimal actualAdoptionRate() {
        return BigDecimal.valueOf(aiAcceptedAnswerCount())
                .divide(
                        BigDecimal.valueOf(submittedAnswerCount()),
                        4,
                        RoundingMode.HALF_UP);
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
