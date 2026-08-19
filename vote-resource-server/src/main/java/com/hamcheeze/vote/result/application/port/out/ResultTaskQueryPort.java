package com.hamcheeze.vote.result.application.port.out;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public interface ResultTaskQueryPort {

    Optional<ResultTask> findByTaskId(UUID taskId);

    record ResultTask(
            UUID taskId,
            String title,
            String description,
            Status status,
            Instant openedAt,
            Instant closedAt,
            List<Question> questions
    ) {

        public ResultTask {
            Objects.requireNonNull(taskId, "taskId");
            title = requireText(title, "title");
            Objects.requireNonNull(status, "status");
            questions = List.copyOf(Objects.requireNonNull(
                    questions, "questions"));
            if (questions.isEmpty()) {
                throw new IllegalArgumentException(
                        "questions must not be empty");
            }
        }
    }

    record Question(
            UUID questionId,
            int displayOrder,
            AnswerType answerType,
            String content,
            String description,
            List<Option> options
    ) {

        public Question {
            Objects.requireNonNull(questionId, "questionId");
            requirePositive(displayOrder, "displayOrder");
            Objects.requireNonNull(answerType, "answerType");
            content = requireText(content, "content");
            options = List.copyOf(Objects.requireNonNull(
                    options, "options"));
        }
    }

    record Option(
            UUID optionId,
            int displayOrder,
            OptionKind kind,
            String content
    ) {

        public Option {
            Objects.requireNonNull(optionId, "optionId");
            requirePositive(displayOrder, "displayOrder");
            Objects.requireNonNull(kind, "kind");
            content = requireText(content, "content");
        }
    }

    enum Status {
        DRAFT,
        SCHEDULED,
        OPEN,
        CLOSED
    }

    enum AnswerType {
        SINGLE_CHOICE,
        MULTIPLE_CHOICE,
        SHORT_TEXT,
        LONG_TEXT,
        NUMBER,
        SCALE
    }

    enum OptionKind {
        STANDARD,
        OTHER
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

    private static void requirePositive(int value, String field) {
        if (value < 1) {
            throw new IllegalArgumentException(
                    field + " must be positive");
        }
    }
}
