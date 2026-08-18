package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.prediction.EnsureTaskPredictionResult;
import com.hamcheeze.vote.task.application.query.AdminTaskQueryService;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.query.TaskPredictionQueryService;
import com.hamcheeze.vote.task.application.query.UserTaskQueryService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionOutcome;
import com.hamcheeze.vote.task.domain.answer.LongTextValue;
import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.NumberValue;
import com.hamcheeze.vote.task.domain.answer.ScaleValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskViolation;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.submission.TaskAnswerSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswerCommand;
import com.hamcheeze.vote.task.domain.submission.UserAnsweredTaskQuestion;
import com.hamcheeze.vote.task.domain.task.LongTextConstraint;
import com.hamcheeze.vote.task.domain.task.MultipleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.NumberConstraint;
import com.hamcheeze.vote.task.domain.task.ScaleConstraint;
import com.hamcheeze.vote.task.domain.task.ShortTextConstraint;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleEventType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleTrigger;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskOptionKind;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionConstraint;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class TaskApiModels {

    private TaskApiModels() {
    }

    record TaskWriteRequest(
            @NotBlank String title,
            String description,
            @NotNull List<@Valid QuestionWriteRequest> questions
    ) {
        List<TaskQuestion> toQuestions() {
            return questions.stream()
                    .map(QuestionWriteRequest::toDomain)
                    .toList();
        }
    }

    record QuestionWriteRequest(
            UUID id,
            @Positive int displayOrder,
            @NotNull TaskQuestionType type,
            @NotBlank String content,
            String description,
            @NotNull @Valid ConstraintRequest constraint,
            List<@Valid OptionWriteRequest> options
    ) {
        TaskQuestion toDomain() {
            return new TaskQuestion(
                    new TaskQuestionId(id == null ? UUID.randomUUID() : id),
                    displayOrder,
                    type,
                    content,
                    description,
                    constraint.toDomain(type),
                    options == null ? List.of() : options.stream()
                            .map(OptionWriteRequest::toDomain)
                            .toList());
        }
    }

    record OptionWriteRequest(
            UUID id,
            @Positive int displayOrder,
            TaskOptionKind kind,
            String content
    ) {
        TaskOption toDomain() {
            TaskOptionId optionId = new TaskOptionId(
                    id == null ? UUID.randomUUID() : id);
            TaskOptionKind resolvedKind = kind == null
                    ? TaskOptionKind.STANDARD : kind;
            return resolvedKind == TaskOptionKind.OTHER
                    ? TaskOption.other(optionId, displayOrder)
                    : TaskOption.standard(optionId, displayOrder, content);
        }
    }

    record ConstraintRequest(
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
        TaskQuestionConstraint toDomain(TaskQuestionType type) {
            return switch (type) {
                case SINGLE_CHOICE -> new SingleChoiceConstraint();
                case MULTIPLE_CHOICE -> new MultipleChoiceConstraint(
                        required(minimumSelections, "minimumSelections"),
                        required(maximumSelections, "maximumSelections"));
                case SHORT_TEXT -> new ShortTextConstraint(
                        required(maxLength, "maxLength"));
                case LONG_TEXT -> new LongTextConstraint(
                        required(maxLength, "maxLength"));
                case NUMBER -> new NumberConstraint(
                        minimumValue,
                        maximumValue,
                        required(decimalAllowed, "decimalAllowed"));
                case SCALE -> new ScaleConstraint(
                        required(scaleMinimum, "scaleMinimum"),
                        required(scaleMaximum, "scaleMaximum"),
                        minimumLabel,
                        maximumLabel);
            };
        }
    }

    record ScheduleRequest(
            @NotNull Instant opensAt,
            @NotNull Instant closesAt,
            String reason
    ) {
        TaskSchedule toDomain() {
            return new TaskSchedule(opensAt, closesAt);
        }
    }

    record OpenNowRequest(
            @NotNull Instant closesAt,
            String reason
    ) {
    }

    record DeadlineRequest(
            @NotNull Instant closesAt,
            String reason
    ) {
    }

    record ReasonRequest(String reason) {
    }

    record SubmitRequest(
            @NotNull UUID predictionId,
            @NotEmpty List<@Valid SubmissionAnswerRequest> answers
    ) {
        List<TaskSubmissionAnswerCommand> toAnswers() {
            return answers.stream()
                    .map(SubmissionAnswerRequest::toDomain)
                    .toList();
        }
    }

    record SubmissionAnswerRequest(
            @NotNull UUID questionId,
            @NotNull TaskAnswerSource source,
            UUID candidateId,
            @Valid AnswerValueRequest answer
    ) {
        TaskSubmissionAnswerCommand toDomain() {
            TaskQuestionId resolvedQuestionId =
                    new TaskQuestionId(questionId);
            return switch (source) {
                case AI_ACCEPTED -> {
                    if (answer != null) {
                        throw new IllegalArgumentException(
                                "answer is not allowed for AI_ACCEPTED");
                    }
                    yield new AcceptTaskPredictionCandidate(
                            resolvedQuestionId,
                            new TaskPredictionCandidateId(required(
                                    candidateId, "candidateId")));
                }
                case USER_ANSWERED -> {
                    if (candidateId != null) {
                        throw new IllegalArgumentException(
                                "candidateId is not allowed for USER_ANSWERED");
                    }
                    yield new UserAnsweredTaskQuestion(
                            resolvedQuestionId,
                            required(answer, "answer").toDomain());
                }
            };
        }
    }

    record AnswerValueRequest(
            @NotNull TaskQuestionType type,
            SelectionRequest selection,
            List<@Valid SelectionRequest> selections,
            String text,
            BigDecimal number,
            Integer scale
    ) {
        TaskAnswerValue toDomain() {
            return switch (type) {
                case SINGLE_CHOICE -> new SingleChoiceValue(
                        required(selection, "selection").toDomain());
                case MULTIPLE_CHOICE -> new MultipleChoiceValue(
                        required(selections, "selections").stream()
                                .map(SelectionRequest::toDomain)
                                .toList());
                case SHORT_TEXT -> new ShortTextValue(
                        required(text, "text"));
                case LONG_TEXT -> new LongTextValue(
                        required(text, "text"));
                case NUMBER -> new NumberValue(
                        required(number, "number"));
                case SCALE -> new ScaleValue(
                        required(scale, "scale"));
            };
        }
    }

    record SelectionRequest(
            @NotNull UUID optionId,
            String otherText
    ) {
        TaskOptionSelection toDomain() {
            return new TaskOptionSelection(
                    new TaskOptionId(optionId), otherText);
        }
    }

    record TaskResponse(
            UUID id,
            String title,
            String description,
            List<QuestionResponse> questions,
            TaskStatus status,
            ScheduleResponse schedule,
            Instant publishedAt,
            Instant openedAt,
            Instant closedAt,
            TaskClosureType closureType,
            Instant createdAt,
            Instant updatedAt
    ) {
        static TaskResponse from(Task task) {
            return new TaskResponse(
                    task.id().value(), task.title(), task.description(),
                    task.questions().stream()
                            .map(QuestionResponse::from).toList(),
                    task.status(), ScheduleResponse.from(task.schedule()),
                    task.publishedAt(), task.openedAt(), task.closedAt(),
                    task.closureType(), task.createdAt(), task.updatedAt());
        }
    }

    record QuestionResponse(
            UUID id,
            int displayOrder,
            TaskQuestionType type,
            String content,
            String description,
            ConstraintResponse constraint,
            List<OptionResponse> options
    ) {
        static QuestionResponse from(TaskQuestion question) {
            return new QuestionResponse(
                    question.id().value(), question.displayOrder(),
                    question.type(), question.content(),
                    question.description(),
                    ConstraintResponse.from(question.constraint()),
                    question.options().stream()
                            .map(OptionResponse::from).toList());
        }
    }

    record ConstraintResponse(
            TaskQuestionType type,
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
        static ConstraintResponse from(TaskQuestionConstraint constraint) {
            return switch (constraint) {
                case SingleChoiceConstraint ignored -> empty(
                        TaskQuestionType.SINGLE_CHOICE);
                case MultipleChoiceConstraint multiple ->
                        new ConstraintResponse(
                                TaskQuestionType.MULTIPLE_CHOICE,
                                multiple.minimumSelections(),
                                multiple.maximumSelections(),
                                null, null, null, null,
                                null, null, null, null);
                case ShortTextConstraint text -> new ConstraintResponse(
                        TaskQuestionType.SHORT_TEXT,
                        null, null, text.maxLength(), null, null, null,
                        null, null, null, null);
                case LongTextConstraint text -> new ConstraintResponse(
                        TaskQuestionType.LONG_TEXT,
                        null, null, text.maxLength(), null, null, null,
                        null, null, null, null);
                case NumberConstraint number -> new ConstraintResponse(
                        TaskQuestionType.NUMBER,
                        null, null, null,
                        number.minimumValue(), number.maximumValue(),
                        number.decimalAllowed(),
                        null, null, null, null);
                case ScaleConstraint scale -> new ConstraintResponse(
                        TaskQuestionType.SCALE,
                        null, null, null, null, null, null,
                        scale.minimumValue(), scale.maximumValue(),
                        scale.minimumLabel(), scale.maximumLabel());
            };
        }

        private static ConstraintResponse empty(TaskQuestionType type) {
            return new ConstraintResponse(
                    type, null, null, null, null, null, null,
                    null, null, null, null);
        }
    }

    record OptionResponse(
            UUID id,
            int displayOrder,
            TaskOptionKind kind,
            String content
    ) {
        static OptionResponse from(TaskOption option) {
            return new OptionResponse(
                    option.id().value(), option.displayOrder(),
                    option.kind(), option.content());
        }
    }

    record ScheduleResponse(Instant opensAt, Instant closesAt) {
        static ScheduleResponse from(TaskSchedule schedule) {
            return schedule == null ? null : new ScheduleResponse(
                    schedule.scheduledOpenAt(),
                    schedule.scheduledCloseAt());
        }
    }

    record LifecycleResponse(
            UUID id,
            TaskLifecycleEventType eventType,
            TaskStatus previousStatus,
            TaskStatus newStatus,
            ScheduleResponse previousSchedule,
            ScheduleResponse newSchedule,
            TaskLifecycleTrigger trigger,
            String actorId,
            String reason,
            TaskClosureType closureType,
            Instant occurredAt
    ) {
        static LifecycleResponse from(TaskLifecycleHistory history) {
            return new LifecycleResponse(
                    history.id().value(), history.eventType(),
                    history.previousStatus(), history.newStatus(),
                    ScheduleResponse.from(history.previousSchedule()),
                    ScheduleResponse.from(history.newSchedule()),
                    history.trigger(),
                    history.actorId() == null
                            ? null : history.actorId().value(),
                    history.reason(), history.closureType(),
                    history.occurredAt());
        }
    }

    record AdminTaskSummaryResponse(
            UUID taskId,
            String title,
            TaskStatus status,
            ScheduleResponse schedule,
            Instant publishedAt,
            Instant openedAt,
            Instant closedAt,
            TaskClosureType closureType,
            int questionCount,
            Instant createdAt,
            Instant updatedAt
    ) {
        static AdminTaskSummaryResponse from(
                AdminTaskQueryService.AdminTaskSummary summary
        ) {
            return new AdminTaskSummaryResponse(
                    summary.taskId().value(), summary.title(),
                    summary.status(), ScheduleResponse.from(summary.schedule()),
                    summary.publishedAt(), summary.openedAt(),
                    summary.closedAt(), summary.closureType(),
                    summary.questionCount(), summary.createdAt(),
                    summary.updatedAt());
        }
    }

    record AdminTaskDetailResponse(
            TaskResponse task,
            List<LifecycleResponse> lifecycleHistory
    ) {
        static AdminTaskDetailResponse from(
                AdminTaskQueryService.AdminTaskDetail detail
        ) {
            return new AdminTaskDetailResponse(
                    TaskResponse.from(detail.task()),
                    detail.lifecycleHistory().stream()
                            .map(LifecycleResponse::from).toList());
        }
    }

    record UserTaskSummaryResponse(
            UUID taskId,
            String title,
            String description,
            int questionCount,
            Instant openedAt,
            Instant closesAt,
            SubmissionStateResponse submission
    ) {
        static UserTaskSummaryResponse from(
                UserTaskQueryService.UserTaskSummary summary
        ) {
            return new UserTaskSummaryResponse(
                    summary.taskId().value(), summary.title(),
                    summary.description(), summary.questionCount(),
                    summary.openedAt(), summary.closesAt(),
                    SubmissionStateResponse.from(summary.submission()));
        }
    }

    record UserTaskDetailResponse(
            TaskResponse task,
            Instant closesAt,
            SubmissionStateResponse submission
    ) {
        static UserTaskDetailResponse from(
                UserTaskQueryService.UserTaskDetail detail
        ) {
            return new UserTaskDetailResponse(
                    TaskResponse.from(detail.task()), detail.closesAt(),
                    SubmissionStateResponse.from(detail.submission()));
        }
    }

    record SubmissionStateResponse(
            boolean submitted,
            UUID submissionId,
            Instant submittedAt
    ) {
        static SubmissionStateResponse from(
                UserTaskQueryService.SubmissionState state
        ) {
            return new SubmissionStateResponse(
                    state.submitted(),
                    state.submissionId() == null
                            ? null : state.submissionId().value(),
                    state.submittedAt());
        }
    }

    record EnsurePredictionResponse(
            UUID taskId,
            UUID predictionId,
            UUID personaGenerationId,
            String personaId,
            TaskPredictionStatus status,
            boolean created,
            boolean waiting,
            boolean predictedAnswerAllowed,
            boolean directAnswerAllowed,
            List<PredictionCandidateResponse> candidates,
            Instant nextRetryAt,
            Instant completedAt,
            String failureCode
    ) {
        static EnsurePredictionResponse from(
                EnsureTaskPredictionResult result
        ) {
            TaskPrediction prediction = result.prediction();
            return new EnsurePredictionResponse(
                    prediction.taskId().value(), prediction.id().value(),
                    prediction.personaGenerationId().value(),
                    prediction.personaId().value(), prediction.status(),
                    result.created(), !prediction.status().terminal(),
                    result.predictedAnswerAllowed(),
                    result.directAnswerAllowed(),
                    prediction.candidates().stream()
                            .map(PredictionCandidateResponse::from).toList(),
                    prediction.nextRetryAt(), prediction.completedAt(),
                    prediction.lastError() == null
                            ? null : prediction.lastError().code());
        }
    }

    record PredictionViewResponse(
            UUID taskId,
            TaskPredictionQueryService.TaskPredictionViewState state,
            UUID personaGenerationId,
            String personaId,
            UUID predictionId,
            TaskPredictionStatus predictionStatus,
            List<PredictionCandidateResponse> candidates,
            boolean waiting,
            boolean predictionRequestAllowed,
            boolean submissionAllowed,
            boolean predictedAnswerAllowed,
            boolean directAnswerAllowed,
            List<TaskAnswerSource> allowedAnswerSources,
            UUID submissionId,
            Instant nextRetryAt,
            Instant completedAt,
            String failureCode
    ) {
        static PredictionViewResponse from(
                TaskPredictionQueryService.TaskPredictionView view
        ) {
            return new PredictionViewResponse(
                    view.taskId().value(), view.state(),
                    view.personaGenerationId() == null ? null
                            : view.personaGenerationId().value(),
                    view.personaId() == null ? null
                            : view.personaId().value(),
                    view.predictionId() == null ? null
                            : view.predictionId().value(),
                    view.predictionStatus(),
                    view.candidates().stream()
                            .map(PredictionCandidateResponse::from).toList(),
                    view.waiting(), view.predictionRequestAllowed(),
                    view.submissionAllowed(), view.predictedAnswerAllowed(),
                    view.directAnswerAllowed(), view.allowedAnswerSources(),
                    view.submissionId() == null ? null
                            : view.submissionId().value(),
                    view.nextRetryAt(),
                    view.completedAt(), view.failureCode());
        }
    }

    record PredictionCandidateResponse(
            UUID id,
            UUID questionId,
            int candidateOrder,
            AnswerValueResponse answer,
            String rationale
    ) {
        static PredictionCandidateResponse from(
                TaskPredictionCandidate candidate
        ) {
            return new PredictionCandidateResponse(
                    candidate.id().value(), candidate.questionId().value(),
                    candidate.candidateOrder(),
                    AnswerValueResponse.from(candidate.answerValue()),
                    candidate.rationale());
        }
    }

    record SubmissionResponse(
            String code,
            boolean replayed,
            UUID taskId,
            UUID submissionId,
            Instant submittedAt
    ) {
        static SubmissionResponse from(
                TaskSubmissionOutcome outcome,
                boolean replayed
        ) {
            return new SubmissionResponse(
                    outcome.code(), replayed, outcome.taskId().value(),
                    outcome.submissionId().value(), outcome.submittedAt());
        }
    }

    record MySubmissionResponse(
            UUID submissionId,
            UUID taskId,
            String taskTitle,
            String taskDescription,
            UUID personaGenerationId,
            UUID predictionId,
            Instant submittedAt,
            List<MySubmissionAnswerResponse> answers
    ) {
        static MySubmissionResponse from(
                MyTaskSubmissionQueryService.MyTaskSubmission submission
        ) {
            return new MySubmissionResponse(
                    submission.submissionId().value(),
                    submission.taskId().value(), submission.taskTitle(),
                    submission.taskDescription(),
                    submission.personaGenerationId().value(),
                    submission.predictionId().value(),
                    submission.submittedAt(),
                    submission.answers().stream()
                            .map(MySubmissionAnswerResponse::from).toList());
        }
    }

    record MySubmissionAnswerResponse(
            UUID questionId,
            QuestionResponse question,
            TaskAnswerSource source,
            AdoptedCandidateResponse adoptedCandidate,
            AnswerValueResponse finalAnswer
    ) {
        static MySubmissionAnswerResponse from(
                MyTaskSubmissionQueryService.MyTaskSubmissionAnswer answer
        ) {
            return new MySubmissionAnswerResponse(
                    answer.questionId().value(),
                    QuestionResponse.from(answer.question()), answer.source(),
                    AdoptedCandidateResponse.from(answer.adoptedCandidate()),
                    AnswerValueResponse.from(answer.finalAnswerValue()));
        }
    }

    record AdoptedCandidateResponse(
            UUID candidateId,
            int candidateOrder,
            String rationale
    ) {
        static AdoptedCandidateResponse from(
                MyTaskSubmissionQueryService.AdoptedCandidate candidate
        ) {
            return candidate == null ? null : new AdoptedCandidateResponse(
                    candidate.candidateId().value(),
                    candidate.candidateOrder(), candidate.rationale());
        }
    }

    record AnswerValueResponse(
            TaskQuestionType type,
            SelectionResponse selection,
            List<SelectionResponse> selections,
            String text,
            BigDecimal number,
            Integer scale
    ) {
        static AnswerValueResponse from(TaskAnswerValue value) {
            return switch (value) {
                case SingleChoiceValue single -> new AnswerValueResponse(
                        value.questionType(),
                        SelectionResponse.from(single.selection()),
                        null, null, null, null);
                case MultipleChoiceValue multiple -> new AnswerValueResponse(
                        value.questionType(), null,
                        multiple.selections().stream()
                                .map(SelectionResponse::from).toList(),
                        null, null, null);
                case ShortTextValue text -> new AnswerValueResponse(
                        value.questionType(), null, null,
                        text.value(), null, null);
                case LongTextValue text -> new AnswerValueResponse(
                        value.questionType(), null, null,
                        text.value(), null, null);
                case NumberValue number -> new AnswerValueResponse(
                        value.questionType(), null, null,
                        null, number.value(), null);
                case ScaleValue scale -> new AnswerValueResponse(
                        value.questionType(), null, null,
                        null, null, scale.value());
            };
        }
    }

    record SelectionResponse(UUID optionId, String otherText) {
        static SelectionResponse from(TaskOptionSelection selection) {
            return new SelectionResponse(
                    selection.optionId().value(), selection.otherText());
        }
    }

    static List<TaskViolation> violations(TaskSubmissionOutcome outcome) {
        return outcome.violations();
    }

    private static <T> T required(T value, String field) {
        if (value == null) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }

}
