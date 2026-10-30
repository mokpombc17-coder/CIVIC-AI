package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public record PersonaSurveySource(
        PersonaSourceId responseId,
        PersonaUserId userId,
        UUID roundId,
        int roundNumber,
        UUID contentVersionId,
        int contentVersionNumber,
        Instant submittedAt,
        List<PersonaSurveyAnswer> answers
) {

    public PersonaSurveySource {
        Objects.requireNonNull(responseId, "responseId");
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(roundId, "roundId");
        Objects.requireNonNull(contentVersionId, "contentVersionId");
        if (roundNumber < 1) {
            throw new IllegalArgumentException(
                    "roundNumber must be positive");
        }
        if (contentVersionNumber < 1) {
            throw new IllegalArgumentException(
                    "contentVersionNumber must be positive");
        }
        Objects.requireNonNull(submittedAt, "submittedAt");
        answers = immutableList(answers, "answers");
    }

    public record PersonaSurveyAnswer(
            PersonaSurveyQuestion question,
            Optional<PersonaSurveyAnswerValue> value
    ) {

        public PersonaSurveyAnswer {
            Objects.requireNonNull(question, "question");
            Objects.requireNonNull(value, "value");
        }
    }

    public record PersonaSurveyQuestion(
            UUID questionId,
            UUID questionLineageId,
            QuestionType type,
            String prompt,
            Optional<String> description,
            int displayOrder,
            List<PersonaSurveyQuestionItem> items
    ) {

        public PersonaSurveyQuestion {
            Objects.requireNonNull(questionId, "questionId");
            Objects.requireNonNull(questionLineageId, "questionLineageId");
            Objects.requireNonNull(type, "type");
            prompt = requireText(prompt, "prompt");
            description = Objects.requireNonNull(
                    description, "description");
            items = immutableList(items, "items");
            if (displayOrder < 1) {
                throw new IllegalArgumentException(
                        "displayOrder must be positive");
            }
        }

        public PersonaSurveyQuestion(
                UUID questionId,
                UUID questionLineageId,
                QuestionType type,
                String prompt,
                Optional<String> description,
                int displayOrder
        ) {
            this(
                    questionId,
                    questionLineageId,
                    type,
                    prompt,
                    description,
                    displayOrder,
                    List.of());
        }
    }

    public record PersonaSurveyQuestionItem(
            UUID itemId,
            UUID itemLineageId,
            String itemKey,
            String itemLabel,
            int displayOrder
    ) {

        public PersonaSurveyQuestionItem {
            Objects.requireNonNull(itemId, "itemId");
            Objects.requireNonNull(itemLineageId, "itemLineageId");
            itemKey = requireText(itemKey, "itemKey");
            itemLabel = requireText(itemLabel, "itemLabel");
            if (displayOrder < 1) {
                throw new IllegalArgumentException(
                        "displayOrder must be positive");
            }
        }
    }

    public sealed interface PersonaSurveyAnswerValue
            permits SingleChoiceValue, MultipleChoiceValue, TextValue,
            NumberValue, ScaleValue, MatrixSingleChoiceValue,
            MatrixScaleValue {
    }

    public record SingleChoiceValue(
            PersonaSurveyOption selectedOption
    ) implements PersonaSurveyAnswerValue {

        public SingleChoiceValue {
            Objects.requireNonNull(selectedOption, "selectedOption");
        }
    }

    public record MultipleChoiceValue(
            List<PersonaSurveyOption> selectedOptions
    ) implements PersonaSurveyAnswerValue {

        public MultipleChoiceValue {
            selectedOptions = immutableList(
                    selectedOptions, "selectedOptions");
            if (selectedOptions.isEmpty()) {
                throw new IllegalArgumentException(
                        "selectedOptions must not be empty");
            }
        }
    }

    public record TextValue(String value)
            implements PersonaSurveyAnswerValue {

        public TextValue {
            value = Objects.requireNonNull(value, "value");
        }
    }

    public record NumberValue(BigDecimal value)
            implements PersonaSurveyAnswerValue {

        public NumberValue {
            Objects.requireNonNull(value, "value");
        }
    }

    public record ScaleValue(int value)
            implements PersonaSurveyAnswerValue {
    }

    public record MatrixSingleChoiceValue(
            List<MatrixSingleChoiceItemValue> itemValues
    ) implements PersonaSurveyAnswerValue {

        public MatrixSingleChoiceValue {
            itemValues = immutableList(itemValues, "itemValues");
        }
    }

    public record MatrixSingleChoiceItemValue(
            UUID itemId,
            PersonaSurveyOption selectedOption
    ) {

        public MatrixSingleChoiceItemValue {
            Objects.requireNonNull(itemId, "itemId");
            Objects.requireNonNull(selectedOption, "selectedOption");
        }
    }

    public record MatrixScaleValue(
            List<MatrixScaleItemValue> itemValues
    ) implements PersonaSurveyAnswerValue {

        public MatrixScaleValue {
            itemValues = immutableList(itemValues, "itemValues");
        }
    }

    public record MatrixScaleItemValue(
            UUID itemId,
            int value
    ) {

        public MatrixScaleItemValue {
            Objects.requireNonNull(itemId, "itemId");
        }
    }

    public record PersonaSurveyOption(
            UUID optionId,
            UUID optionLineageId,
            OptionKind kind,
            String label,
            int displayOrder,
            Optional<String> inputText
    ) {

        public PersonaSurveyOption {
            Objects.requireNonNull(optionId, "optionId");
            Objects.requireNonNull(optionLineageId, "optionLineageId");
            Objects.requireNonNull(kind, "kind");
            label = requireText(label, "label");
            if (displayOrder < 1) {
                throw new IllegalArgumentException(
                        "displayOrder must be positive");
            }
            inputText = Objects.requireNonNull(inputText, "inputText");
            if (kind == OptionKind.STANDARD && inputText.isPresent()) {
                throw new IllegalArgumentException(
                        "STANDARD option cannot contain inputText");
            }
            if (kind == OptionKind.OTHER
                    && inputText.filter(value -> !value.isBlank()).isEmpty()) {
                throw new IllegalArgumentException(
                        "OTHER option requires inputText");
            }
        }
    }

    public enum QuestionType {
        SINGLE_CHOICE,
        MULTIPLE_CHOICE,
        SHORT_TEXT,
        LONG_TEXT,
        NUMBER,
        SCALE,
        MATRIX_SINGLE_CHOICE,
        MATRIX_SCALE
    }

    public enum OptionKind {
        STANDARD,
        OTHER
    }

    private static <T> List<T> immutableList(
            List<T> values,
            String field
    ) {
        Objects.requireNonNull(values, field);
        if (values.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    field + " must not contain null");
        }
        return List.copyOf(values);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
        return value;
    }
}
