package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Consumer-neutral, immutable input for the task-result-view/v1 read model.
 * Database identifiers are deliberately excluded from the public contract.
 */
public record TaskResultViewV1(
        int resultVersion,
        Instant closedAt,
        TaskClosureType closureType,
        TaskData task,
        QuestionData question,
        List<OptionData> options,
        List<ResponseData> responses
) {

    public static final String SCHEMA_VERSION = "task-result-view/v1";
    public static final int RESULT_VERSION = 1;

    public TaskResultViewV1 {
        if (resultVersion < 1) {
            throw new IllegalArgumentException(
                    "resultVersion must be positive");
        }
        Objects.requireNonNull(closedAt, "closedAt");
        Objects.requireNonNull(closureType, "closureType");
        if (!closureType.resultEligible()) {
            throw new IllegalArgumentException(
                    "closureType must be result eligible");
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
        for (int index = 0; index < options.size(); index++) {
            OptionData option = Objects.requireNonNull(
                    options.get(index), "option");
            int expectedOrder = index + 1;
            if (option.displayOrder() != expectedOrder) {
                throw new IllegalArgumentException(
                        "options must use continuous displayOrder from 1");
            }
        }
    }

    private static void validateResponses(
            List<OptionData> options,
            List<ResponseData> responses
    ) {
        Set<Integer> optionOrders = new HashSet<>();
        for (OptionData option : options) {
            optionOrders.add(option.displayOrder());
        }
        for (int index = 0; index < responses.size(); index++) {
            ResponseData response = Objects.requireNonNull(
                    responses.get(index), "response");
            int expectedSequence = index + 1;
            if (response.participantSequence() != expectedSequence) {
                throw new IllegalArgumentException(
                        "responses must use continuous participant sequence "
                                + "from 1");
            }
            if (!optionOrders.contains(response.selectedOptionDisplayOrder())) {
                throw new IllegalArgumentException(
                        "response selected option must exist");
            }
        }
    }

    public record TaskData(String title, String description) {

        public TaskData {
            title = requireText(title, "title");
        }
    }

    public record QuestionData(
            TaskQuestionType questionType,
            String content,
            String description
    ) {

        public QuestionData {
            Objects.requireNonNull(questionType, "questionType");
            if (questionType != TaskQuestionType.SINGLE_CHOICE) {
                throw new IllegalArgumentException(
                        "task-result-view/v1 supports SINGLE_CHOICE only");
            }
            content = requireText(content, "content");
        }
    }

    public record OptionData(int displayOrder, String content) {

        public OptionData {
            if (displayOrder < 1) {
                throw new IllegalArgumentException(
                        "displayOrder must be positive");
            }
            content = requireText(content, "content");
        }
    }

    public record ResponseData(
            int participantSequence,
            int selectedOptionDisplayOrder,
            String reason,
            TaskReasonSource reasonSource
    ) {

        public ResponseData {
            if (participantSequence < 1) {
                throw new IllegalArgumentException(
                        "participantSequence must be positive");
            }
            if (selectedOptionDisplayOrder < 1) {
                throw new IllegalArgumentException(
                        "selectedOptionDisplayOrder must be positive");
            }
            reason = requireText(reason, "reason");
            Objects.requireNonNull(reasonSource, "reasonSource");
        }
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value;
    }
}
