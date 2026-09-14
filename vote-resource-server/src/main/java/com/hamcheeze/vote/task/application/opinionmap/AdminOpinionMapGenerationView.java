package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record AdminOpinionMapGenerationView(
        TaskId taskId,
        Integer resultVersion,
        Status status,
        int attemptCount,
        String lastErrorCode,
        Instant nextAttemptAt,
        Instant processingStartedAt,
        Instant completedAt,
        Instant updatedAt,
        boolean canGenerate,
        boolean canRetry,
        List<OptionView> options
) {

    public AdminOpinionMapGenerationView {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(status, "status");
        if (resultVersion != null && resultVersion < 1) {
            throw new IllegalArgumentException(
                    "resultVersion must be positive when present");
        }
        if (attemptCount < 0) {
            throw new IllegalArgumentException(
                    "attemptCount must not be negative");
        }
        options = List.copyOf(Objects.requireNonNull(options, "options"));
        if (canGenerate && status != Status.NOT_CREATED) {
            throw new IllegalArgumentException(
                    "only a not-created result can be generated");
        }
        if (canRetry && status != Status.UNAVAILABLE) {
            throw new IllegalArgumentException(
                    "only an unavailable result can be retried");
        }
        boolean generated = switch (status) {
            case PENDING, PROCESSING, RETRY_WAIT, AVAILABLE, UNAVAILABLE ->
                    true;
            case NOT_ELIGIBLE, NOT_CREATED -> false;
        };
        if (generated && (resultVersion == null || updatedAt == null)) {
            throw new IllegalArgumentException(
                    "generated result must have version and update time");
        }
        if (status == Status.AVAILABLE
                && options.stream().anyMatch(option ->
                option.sameChoice() == null
                        || option.otherChoices() == null)) {
            throw new IllegalArgumentException(
                    "available result must contain every option summary");
        }
        if (status != Status.AVAILABLE
                && options.stream().anyMatch(option ->
                option.sameChoice() != null
                        || option.otherChoices() != null)) {
            throw new IllegalArgumentException(
                    "only available result can contain summaries");
        }
    }

    public record OptionView(
            TaskOptionId optionId,
            int displayOrder,
            String content,
            Integer responseCount,
            Area sameChoice,
            Area otherChoices
    ) {
        public OptionView {
            Objects.requireNonNull(optionId, "optionId");
            if (displayOrder < 1) {
                throw new IllegalArgumentException(
                        "displayOrder must be positive");
            }
            content = requireText(content, "content");
            if (responseCount != null && responseCount < 0) {
                throw new IllegalArgumentException(
                        "responseCount must not be negative");
            }
            if ((sameChoice == null) != (otherChoices == null)) {
                throw new IllegalArgumentException(
                        "sameChoice and otherChoices must be present together");
            }
        }
    }

    public record Area(AreaStatus status, String body) {
        public Area {
            Objects.requireNonNull(status, "status");
            if (status == AreaStatus.AVAILABLE) {
                body = requireText(body, "body");
            } else if (body != null) {
                throw new IllegalArgumentException(
                        "body must be null unless status is AVAILABLE");
            }
        }
    }

    public enum Status {
        NOT_ELIGIBLE,
        NOT_CREATED,
        PENDING,
        PROCESSING,
        RETRY_WAIT,
        AVAILABLE,
        UNAVAILABLE
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
