package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.prediction.PredictionCreationCommand;
import com.hamcheeze.vote.task.domain.answer.LongTextValue;
import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.NumberValue;
import com.hamcheeze.vote.task.domain.answer.ScaleValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.task.LongTextConstraint;
import com.hamcheeze.vote.task.domain.task.MultipleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.NumberConstraint;
import com.hamcheeze.vote.task.domain.task.ScaleConstraint;
import com.hamcheeze.vote.task.domain.task.ShortTextConstraint;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionConstraint;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

final class TaskPredictionHttpModels {

    static final int SCHEMA_VERSION = 3;

    private TaskPredictionHttpModels() {
    }

    record PredictionRequest(
            int schemaVersion,
            UUID requestId,
            String personaId,
            String candidatePolicyVersion,
            String contentFingerprint,
            int minimumReasonsPerOption,
            int maximumReasonsPerOption,
            TaskPayload task
    ) {
        static PredictionRequest from(
                PredictionCreationCommand command,
                String contentFingerprint
        ) {
            return new PredictionRequest(
                    command.requestSchemaVersion(),
                    command.requestId().value(),
                    command.personaId().value(),
                    command.candidatePolicyVersion(),
                    contentFingerprint,
                    TaskLimits.MIN_PREDICTED_REASONS_PER_OPTION,
                    TaskLimits.MAX_PREDICTED_REASONS_PER_OPTION,
                    TaskPayload.from(command.task()));
        }

        static PredictionRequest from(
                TaskPredictionId predictionId,
                TaskPersonaId personaId,
                String candidatePolicyVersion,
                Task task,
                String contentFingerprint
        ) {
            return new PredictionRequest(
                    SCHEMA_VERSION,
                    predictionId.value(),
                    personaId.value(),
                    candidatePolicyVersion,
                    contentFingerprint,
                    TaskLimits.MIN_PREDICTED_REASONS_PER_OPTION,
                    TaskLimits.MAX_PREDICTED_REASONS_PER_OPTION,
                    TaskPayload.from(task));
        }
    }

    record TaskPayload(
            UUID taskId,
            String title,
            String description,
            List<QuestionPayload> questions
    ) {
        static TaskPayload from(Task task) {
            return new TaskPayload(
                    task.id().value(), task.title(), task.description(),
                    task.questions().stream()
                            .map(QuestionPayload::from)
                            .toList());
        }
    }

    record QuestionPayload(
            UUID questionId,
            int displayOrder,
            String type,
            String content,
            String description,
            ConstraintPayload constraint,
            List<OptionPayload> options
    ) {
        static QuestionPayload from(TaskQuestion question) {
            return new QuestionPayload(
                    question.id().value(), question.displayOrder(),
                    question.type().name(), question.content(),
                    question.description(),
                    ConstraintPayload.from(question.constraint()),
                    question.options().stream()
                            .map(OptionPayload::from)
                            .toList());
        }
    }

    record ConstraintPayload(
            String type,
            Integer minimumSelections,
            Integer maximumSelections,
            Integer maxLength,
            BigDecimal minimumValue,
            BigDecimal maximumValue,
            Boolean decimalAllowed,
            Integer scaleMinimum,
            Integer scaleMaximum,
            String minimumLabel,
            String maximumLabel
    ) {
        static ConstraintPayload from(TaskQuestionConstraint constraint) {
            return switch (constraint) {
                case SingleChoiceConstraint ignored -> empty(
                        TaskQuestionType.SINGLE_CHOICE);
                case MultipleChoiceConstraint multiple ->
                        new ConstraintPayload(
                                TaskQuestionType.MULTIPLE_CHOICE.name(),
                                multiple.minimumSelections(),
                                multiple.maximumSelections(),
                                null, null, null, null,
                                null, null, null, null);
                case ShortTextConstraint text -> new ConstraintPayload(
                        TaskQuestionType.SHORT_TEXT.name(),
                        null, null, text.maxLength(),
                        null, null, null, null, null, null, null);
                case LongTextConstraint text -> new ConstraintPayload(
                        TaskQuestionType.LONG_TEXT.name(),
                        null, null, text.maxLength(),
                        null, null, null, null, null, null, null);
                case NumberConstraint number -> new ConstraintPayload(
                        TaskQuestionType.NUMBER.name(),
                        null, null, null,
                        number.minimumValue(), number.maximumValue(),
                        number.decimalAllowed(),
                        null, null, null, null);
                case ScaleConstraint scale -> new ConstraintPayload(
                        TaskQuestionType.SCALE.name(),
                        null, null, null, null, null, null,
                        scale.minimumValue(), scale.maximumValue(),
                        scale.minimumLabel(), scale.maximumLabel());
            };
        }

        private static ConstraintPayload empty(TaskQuestionType type) {
            return new ConstraintPayload(
                    type.name(), null, null, null, null, null, null,
                    null, null, null, null);
        }
    }

    record OptionPayload(
            UUID optionId,
            int displayOrder,
            String kind,
            String content
    ) {
        static OptionPayload from(TaskOption option) {
            return new OptionPayload(
                    option.id().value(), option.displayOrder(),
                    option.kind().name(), option.content());
        }
    }

    record PredictionResponse(
            Integer schemaVersion,
            UUID requestId,
            UUID taskId,
            List<CandidatePayload> candidates
    ) {
        List<TaskPredictedReason> toDomain(
                PredictionCreationCommand command
        ) {
            require(schemaVersion != null
                            && schemaVersion
                            == command.requestSchemaVersion(),
                    "schemaVersion must match stored request version "
                            + command.requestSchemaVersion());
            require(requestId != null
                            && requestId.equals(command.requestId().value()),
                    "response requestId does not match request");
            require(taskId != null
                            && taskId.equals(command.task().id().value()),
                    "response taskId does not match request");
            require(candidates != null, "candidates are required");
            return candidates.stream()
                    .map(candidate -> candidate.toDomain(command))
                    .toList();
        }
    }

    record CandidatePayload(
            UUID candidateId,
            UUID questionId,
            Integer candidateOrder,
            AnswerPayload answer,
            String rationale
    ) {
        TaskPredictedReason toDomain(
                PredictionCreationCommand command
        ) {
            require(candidateId != null, "candidateId is required");
            require(questionId != null, "questionId is required");
            require(questionId.equals(command.task().questions()
                            .getFirst().id().value()),
                    "questionId does not match task question");
            require(candidateOrder != null,
                    "candidateOrder is required");
            require(answer != null, "answer is required");
            TaskAnswerValue answerValue = answer.toDomain();
            require(answerValue instanceof SingleChoiceValue,
                    "answer must be SINGLE_CHOICE");
            SingleChoiceValue singleChoice = (SingleChoiceValue) answerValue;
            return new TaskPredictedReason(
                    new TaskPredictedReasonId(candidateId),
                    command.requestId(),
                    singleChoice.selection().optionId(),
                    candidateOrder,
                    rationale);
        }
    }

    record AnswerPayload(
            TaskQuestionType type,
            SelectionPayload selection,
            List<SelectionPayload> selections,
            String text,
            BigDecimal number,
            Integer scale
    ) {
        TaskAnswerValue toDomain() {
            require(type != null, "answer.type is required");
            return switch (type) {
                case SINGLE_CHOICE -> new SingleChoiceValue(
                        required(selection, "answer.selection")
                                .toDomain());
                case MULTIPLE_CHOICE -> new MultipleChoiceValue(
                        required(selections, "answer.selections").stream()
                                .map(SelectionPayload::toDomain)
                                .toList());
                case SHORT_TEXT -> new ShortTextValue(
                        required(text, "answer.text"));
                case LONG_TEXT -> new LongTextValue(
                        required(text, "answer.text"));
                case NUMBER -> new NumberValue(
                        required(number, "answer.number"));
                case SCALE -> new ScaleValue(
                        required(scale, "answer.scale"));
            };
        }
    }

    record SelectionPayload(UUID optionId, String otherText) {
        TaskOptionSelection toDomain() {
            return new TaskOptionSelection(
                    new TaskOptionId(required(
                            optionId, "answer.optionId")),
                    otherText);
        }
    }

    record ErrorPayload(int httpStatus, String responseBody) {
    }

    record ProviderError(
            String code,
            String detail,
            Boolean retryable,
            Integer maxWaitMinutes
    ) {
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalArgumentException(message);
        }
    }

    private static <T> T required(T value, String field) {
        if (value == null) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }
}
