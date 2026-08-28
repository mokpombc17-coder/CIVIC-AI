package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.prediction.EnsureTaskPredictionResult;
import com.hamcheeze.vote.task.application.query.AdminTaskQueryService;
import com.hamcheeze.vote.task.application.query.CompletedTaskQueryService;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskLifecycleStatus;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskQueryService;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskResultStatus;
import com.hamcheeze.vote.task.application.query.TaskPredictionQueryService;
import com.hamcheeze.vote.task.application.query.UserTaskQueryService;
import com.hamcheeze.vote.task.application.result.MyTaskResultQueryService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionOutcome;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskViolation;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictedReason;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswerCommand;
import com.hamcheeze.vote.task.domain.submission.WriteTaskReason;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleEventType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleTrigger;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

final class TaskApiModels {

    private TaskApiModels() {
    }

    record TaskWriteRequest(
            @NotBlank @Size(max = TaskLimits.MAX_TITLE_LENGTH) String title,
            @Size(max = TaskLimits.MAX_DESCRIPTION_LENGTH) String description,
            @Valid QuestionWriteRequest question
    ) {
        TaskQuestion toQuestion() {
            return question == null ? null : question.toDomain();
        }
    }

    record QuestionWriteRequest(
            UUID id,
            @NotBlank @Size(max = TaskLimits.MAX_QUESTION_CONTENT_LENGTH)
            String content,
            @Size(max = TaskLimits.MAX_QUESTION_DESCRIPTION_LENGTH)
            String description,
            @NotEmpty @Size(max = TaskLimits.MAX_OPTIONS)
            List<@Valid OptionWriteRequest> options
    ) {
        TaskQuestion toDomain() {
            return new TaskQuestion(
                    new TaskQuestionId(id == null ? UUID.randomUUID() : id),
                    1,
                    TaskQuestionType.SINGLE_CHOICE,
                    content,
                    description,
                    new SingleChoiceConstraint(),
                    IntStream.range(0, options.size())
                            .mapToObj(index -> options.get(index)
                                    .toDomain(index + 1))
                            .toList());
        }
    }

    record OptionWriteRequest(
            UUID id,
            @NotBlank @Size(max = TaskLimits.MAX_OPTION_CONTENT_LENGTH)
            String content
    ) {
        TaskOption toDomain(int displayOrder) {
            TaskOptionId optionId = new TaskOptionId(
                    id == null ? UUID.randomUUID() : id);
            return TaskOption.standard(optionId, displayOrder, content);
        }
    }

    record ScheduleRequest(
            @NotNull Instant opensAt,
            @NotNull Instant closesAt,
            @Size(max = TaskLimits.MAX_REASON_LENGTH) String reason
    ) {
        TaskSchedule toDomain() {
            return new TaskSchedule(opensAt, closesAt);
        }
    }

    record OpenNowRequest(
            @NotNull Instant closesAt,
            @Size(max = TaskLimits.MAX_REASON_LENGTH) String reason
    ) {
    }

    record DeadlineRequest(
            @NotNull Instant closesAt,
            @Size(max = TaskLimits.MAX_REASON_LENGTH) String reason
    ) {
    }

    record ReasonRequest(
            @Size(max = TaskLimits.MAX_REASON_LENGTH) String reason
    ) {
    }

    record SubmitRequest(
            @NotNull UUID personaGenerationId,
            @NotNull UUID personaVersionId,
            UUID predictionId,
            @NotNull UUID questionId,
            @NotNull UUID selectedOptionId,
            @NotNull TaskReasonSource reasonSource,
            UUID acceptedPredictedReasonId,
            String reason
    ) {
        TaskSubmissionAnswerCommand toAnswer() {
            TaskQuestionId resolvedQuestionId = new TaskQuestionId(questionId);
            TaskOptionId resolvedOptionId = new TaskOptionId(selectedOptionId);
            return switch (reasonSource) {
                case AI_ACCEPTED -> {
                    if (reason != null) {
                        throw new IllegalArgumentException(
                                "reason is not allowed for AI_ACCEPTED");
                    }
                    yield new AcceptTaskPredictedReason(
                            resolvedQuestionId,
                            resolvedOptionId,
                            new TaskPredictedReasonId(required(
                                    acceptedPredictedReasonId,
                                    "acceptedPredictedReasonId")));
                }
                case USER_WRITTEN -> {
                    if (acceptedPredictedReasonId != null) {
                        throw new IllegalArgumentException(
                                "acceptedPredictedReasonId is not allowed "
                                        + "for USER_WRITTEN");
                    }
                    yield new WriteTaskReason(
                            resolvedQuestionId,
                            resolvedOptionId,
                            required(reason, "reason"));
                }
            };
        }
    }

    record TaskResponse(
            UUID id,
            String title,
            String description,
            QuestionResponse question,
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
                    task.questions().isEmpty() ? null
                            : QuestionResponse.from(
                                    task.questions().getFirst()),
                    task.status(), ScheduleResponse.from(task.schedule()),
                    task.publishedAt(), task.openedAt(), task.closedAt(),
                    task.closureType(), task.createdAt(), task.updatedAt());
        }
    }

    record QuestionResponse(
            UUID id,
            String content,
            String description,
            List<OptionResponse> options
    ) {
        static QuestionResponse from(TaskQuestion question) {
            return new QuestionResponse(
                    question.id().value(), question.content(),
                    question.description(),
                    question.options().stream()
                            .map(OptionResponse::from).toList());
        }
    }

    record OptionResponse(
            UUID id,
            int displayOrder,
            String content
    ) {
        static OptionResponse from(TaskOption option) {
            return new OptionResponse(
                    option.id().value(), option.displayOrder(),
                    option.content());
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
                    summary.createdAt(), summary.updatedAt());
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
            Instant openedAt,
            Instant closesAt,
            SubmissionStateResponse submission
    ) {
        static UserTaskSummaryResponse from(
                UserTaskQueryService.UserTaskSummary summary
        ) {
            return new UserTaskSummaryResponse(
                    summary.taskId().value(), summary.title(),
                    summary.description(), summary.openedAt(),
                    summary.closesAt(),
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

    record ParticipatedTaskPageResponse(
            List<ParticipatedTaskSummaryResponse> items,
            String nextCursor
    ) {
        static ParticipatedTaskPageResponse from(
                ParticipatedTaskQueryService.ParticipatedTaskPage page
        ) {
            return new ParticipatedTaskPageResponse(
                    page.items().stream()
                            .map(ParticipatedTaskSummaryResponse::from)
                            .toList(),
                    page.nextCursor());
        }
    }

    record ParticipatedTaskSummaryResponse(
            UUID taskId,
            String title,
            String description,
            Instant openedAt,
            Instant closesAt,
            Instant closedAt,
            TaskClosureType closureType,
            ParticipatedTaskLifecycleStatus taskStatus,
            boolean canSubmit,
            ParticipatedTaskSubmissionResponse participation,
            ParticipatedTaskResultResponse result
    ) {
        static ParticipatedTaskSummaryResponse from(
                ParticipatedTaskQueryService.ParticipatedTaskSummary summary
        ) {
            return new ParticipatedTaskSummaryResponse(
                    summary.taskId().value(),
                    summary.title(),
                    summary.description(),
                    summary.openedAt(),
                    summary.closesAt(),
                    summary.closedAt(),
                    summary.closureType(),
                    summary.taskStatus(),
                    summary.canSubmit(),
                    ParticipatedTaskSubmissionResponse.from(
                            summary.participation()),
                    ParticipatedTaskResultResponse.from(summary.result()));
        }
    }

    record ParticipatedTaskSubmissionResponse(
            ParticipatedTaskQueryService.ParticipationStatus status,
            UUID submissionId,
            Instant submittedAt
    ) {
        static ParticipatedTaskSubmissionResponse from(
                ParticipatedTaskQueryService.Participation participation
        ) {
            return new ParticipatedTaskSubmissionResponse(
                    participation.status(),
                    participation.submissionId().value(),
                    participation.submittedAt());
        }
    }

    record ParticipatedTaskResultResponse(
            ParticipatedTaskResultStatus status,
            Integer version,
            Instant finalizedAt,
            boolean accessAllowed
    ) {
        static ParticipatedTaskResultResponse from(
                ParticipatedTaskQueryService.Result result
        ) {
            return new ParticipatedTaskResultResponse(
                    result.status(),
                    result.version(),
                    result.finalizedAt(),
                    result.accessAllowed());
        }
    }

    record CompletedTaskPageResponse(
            List<CompletedTaskSummaryResponse> items,
            String nextCursor
    ) {
        static CompletedTaskPageResponse from(
                CompletedTaskQueryService.CompletedTaskPage page
        ) {
            return new CompletedTaskPageResponse(
                    page.items().stream()
                            .map(CompletedTaskSummaryResponse::from)
                            .toList(),
                    page.nextCursor());
        }
    }

    record CompletedTaskSummaryResponse(
            UUID taskId,
            String title,
            String description,
            Instant openedAt,
            Instant closedAt,
            TaskClosureType closureType,
            MyCompletedTaskSubmissionResponse mySubmission
    ) {
        static CompletedTaskSummaryResponse from(
                CompletedTaskQueryService.CompletedTaskSummary summary
        ) {
            return new CompletedTaskSummaryResponse(
                    summary.taskId().value(),
                    summary.title(),
                    summary.description(),
                    summary.openedAt(),
                    summary.closedAt(),
                    summary.closureType(),
                    MyCompletedTaskSubmissionResponse.from(
                            summary.mySubmission()));
        }
    }

    record MyCompletedTaskSubmissionResponse(
            UUID submissionId,
            Instant submittedAt
    ) {
        static MyCompletedTaskSubmissionResponse from(
                CompletedTaskQueryService.MySubmission submission
        ) {
            return new MyCompletedTaskSubmissionResponse(
                    submission.submissionId().value(),
                    submission.submittedAt());
        }
    }

    record MyTaskResultResponse(
            UUID taskId,
            String title,
            String description,
            Instant closedAt,
            TaskClosureType closureType,
            int resultVersion,
            Instant finalizedAt,
            int responseCount,
            MyTaskResultQuestionResponse question,
            List<MyTaskResultOptionResponse> options,
            MyTaskResultSubmissionResponse mySubmission
    ) {
        static MyTaskResultResponse from(
                MyTaskResultQueryService.MyTaskResult result
        ) {
            return new MyTaskResultResponse(
                    result.taskId().value(),
                    result.title(),
                    result.description(),
                    result.closedAt(),
                    result.closureType(),
                    result.resultVersion(),
                    result.finalizedAt(),
                    result.responseCount(),
                    MyTaskResultQuestionResponse.from(result.question()),
                    result.options().stream()
                            .map(MyTaskResultOptionResponse::from)
                            .toList(),
                    MyTaskResultSubmissionResponse.from(
                            result.mySubmission()));
        }
    }

    record MyTaskResultQuestionResponse(
            UUID id,
            String content,
            String description
    ) {
        static MyTaskResultQuestionResponse from(
                MyTaskResultQueryService.ResultQuestion question
        ) {
            return new MyTaskResultQuestionResponse(
                    question.id().value(),
                    question.content(),
                    question.description());
        }
    }

    record MyTaskResultOptionResponse(
            UUID id,
            int displayOrder,
            String content,
            int count,
            boolean selectedByMe
    ) {
        static MyTaskResultOptionResponse from(
                MyTaskResultQueryService.ResultOption option
        ) {
            return new MyTaskResultOptionResponse(
                    option.id().value(),
                    option.displayOrder(),
                    option.content(),
                    option.count(),
                    option.selectedByMe());
        }
    }

    record MyTaskResultSubmissionResponse(
            UUID submissionId,
            UUID selectedOptionId,
            TaskReasonSource reasonSource,
            String finalReason,
            Instant submittedAt
    ) {
        static MyTaskResultSubmissionResponse from(
                MyTaskResultQueryService.ResultSubmission submission
        ) {
            return new MyTaskResultSubmissionResponse(
                    submission.submissionId().value(),
                    submission.selectedOptionId().value(),
                    submission.reasonSource(),
                    submission.finalReason(),
                    submission.submittedAt());
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
            UUID personaVersionId,
            String personaId,
            TaskPredictionStatus status,
            boolean created,
            boolean waiting,
            boolean predictedAnswerAllowed,
            boolean directAnswerAllowed,
            List<PredictedReasonResponse> predictedReasons,
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
                    prediction.personaVersionId().value(),
                    prediction.personaId().value(), prediction.status(),
                    result.created(), !prediction.status().terminal(),
                    result.predictedAnswerAllowed(),
                    result.directAnswerAllowed(),
                    prediction.predictedReasons().stream()
                            .map(PredictedReasonResponse::from).toList(),
                    prediction.nextRetryAt(), prediction.completedAt(),
                    prediction.lastError() == null
                            ? null : prediction.lastError().code());
        }
    }

    record PredictionViewResponse(
            UUID taskId,
            TaskPredictionQueryService.TaskPredictionViewState state,
            UUID personaGenerationId,
            UUID personaVersionId,
            String personaId,
            UUID predictionId,
            TaskPredictionStatus predictionStatus,
            List<PredictedReasonResponse> predictedReasons,
            boolean predictionFeatureEnabled,
            boolean waiting,
            boolean predictionRequestAllowed,
            String predictionUnavailableReason,
            boolean submissionAllowed,
            boolean predictedAnswerAllowed,
            boolean aiAcceptanceAllowed,
            boolean directAnswerAllowed,
            boolean retryable,
            List<TaskReasonSource> allowedReasonSources,
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
                    view.personaVersionId() == null ? null
                            : view.personaVersionId().value(),
                    view.personaId() == null ? null
                            : view.personaId().value(),
                    view.predictionId() == null ? null
                            : view.predictionId().value(),
                    view.predictionStatus(),
                    view.predictedReasons().stream()
                            .map(PredictedReasonResponse::from).toList(),
                    view.predictionFeatureEnabled(), view.waiting(),
                    view.predictionRequestAllowed(),
                    view.predictionUnavailableReason(),
                    view.submissionAllowed(), view.predictedAnswerAllowed(),
                    view.aiAcceptanceAllowed(), view.directAnswerAllowed(),
                    view.retryable(), view.allowedReasonSources(),
                    view.submissionId() == null ? null
                            : view.submissionId().value(),
                    view.nextRetryAt(),
                    view.completedAt(), view.failureCode());
        }
    }

    record PredictedReasonResponse(
            UUID id,
            UUID optionId,
            int reasonOrder,
            String reason
    ) {
        static PredictedReasonResponse from(
                TaskPredictedReason predictedReason
        ) {
            return new PredictedReasonResponse(
                    predictedReason.id().value(),
                    predictedReason.optionId().value(),
                    predictedReason.reasonOrder(),
                    predictedReason.reason());
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
            UUID personaVersionId,
            UUID predictionId,
            Instant submittedAt,
            UUID questionId,
            QuestionResponse question,
            UUID selectedOptionId,
            TaskReasonSource reasonSource,
            UUID acceptedPredictedReasonId,
            String finalReason
    ) {
        static MySubmissionResponse from(
                MyTaskSubmissionQueryService.MyTaskSubmission submission
        ) {
            return new MySubmissionResponse(
                    submission.submissionId().value(),
                    submission.taskId().value(), submission.taskTitle(),
                    submission.taskDescription(),
                    submission.personaGenerationId().value(),
                    submission.personaVersionId().value(),
                    submission.predictionId() == null ? null
                            : submission.predictionId().value(),
                    submission.submittedAt(),
                    submission.questionId().value(),
                    QuestionResponse.from(submission.question()),
                    submission.selectedOptionId().value(),
                    submission.reasonSource(),
                    submission.acceptedPredictedReasonId() == null ? null
                            : submission.acceptedPredictedReasonId().value(),
                    submission.finalReason());
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
