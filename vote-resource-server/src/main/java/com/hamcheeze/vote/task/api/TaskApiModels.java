package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.prediction.EnsureTaskPredictionResult;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationReceipt;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationRecord;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStatus;
import com.hamcheeze.vote.task.application.query.AdminTaskQueryService;
import com.hamcheeze.vote.task.application.query.CompletedTaskQueryService;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskLifecycleStatus;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskQueryService;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskResultStatus;
import com.hamcheeze.vote.task.application.query.TaskPredictionQueryService;
import com.hamcheeze.vote.task.application.query.TaskProgressResponsesQueryService;
import com.hamcheeze.vote.task.application.query.TaskProgressSummaryQueryService;
import com.hamcheeze.vote.task.application.query.UserTaskQueryService;
import com.hamcheeze.vote.task.application.result.MyTaskResultQueryService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionOutcome;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskViolation;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
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
            @NotNull UUID selectedOptionId,
            @NotNull TaskReasonSource reasonSource,
            UUID predictedReasonId,
            @Size(max = TaskLimits.MAX_REASON_LENGTH) String reason
    ) {
        TaskSubmissionService.SubmitTaskCommand toCommand(TaskId taskId) {
            return switch (required(reasonSource, "reasonSource")) {
                case AI_ACCEPTED -> {
                    if (reason != null) {
                        throw new IllegalArgumentException(
                                "reason is not allowed for AI_ACCEPTED");
                    }
                    yield new TaskSubmissionService.SubmitTaskCommand(
                            taskId,
                            new TaskOptionId(selectedOptionId),
                            reasonSource,
                            new TaskPredictedReasonId(required(
                                    predictedReasonId,
                                    "predictedReasonId")),
                            null);
                }
                case USER_WRITTEN -> {
                    if (predictedReasonId != null) {
                        throw new IllegalArgumentException(
                                "predictedReasonId is not allowed "
                                        + "for USER_WRITTEN");
                    }
                    yield new TaskSubmissionService.SubmitTaskCommand(
                            taskId,
                            new TaskOptionId(selectedOptionId),
                            reasonSource,
                            null,
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
            TaskPreparationViewResponse preparation,
            AdminTaskCapabilitiesResponse capabilities,
            List<LifecycleResponse> lifecycleHistory
    ) {
        static AdminTaskDetailResponse from(
                AdminTaskQueryService.AdminTaskDetail detail
        ) {
            return new AdminTaskDetailResponse(
                    TaskResponse.from(detail.task()),
                    TaskPreparationViewResponse.from(detail.preparation()),
                    AdminTaskCapabilitiesResponse.from(
                            detail.capabilities()),
                    detail.lifecycleHistory().stream()
                            .map(LifecycleResponse::from).toList());
        }
    }

    record TaskPreparationCommandResponse(
            UUID taskId,
            TaskPreparationViewResponse preparation,
            boolean replayed
    ) {
        static TaskPreparationCommandResponse from(
                TaskPreparationReceipt receipt
        ) {
            return new TaskPreparationCommandResponse(
                    receipt.taskId().value(),
                    TaskPreparationViewResponse.from(receipt),
                    receipt.replayed());
        }
    }

    record TaskPreparationViewResponse(
            UUID requestId,
            TaskPreparationStatus status,
            String contentFingerprint,
            int attemptCount,
            Instant processingStartedAt,
            Instant preparedAt,
            TaskPreparationErrorResponse lastError,
            Instant updatedAt
    ) {
        static TaskPreparationViewResponse from(
                TaskPreparationRecord preparation
        ) {
            return preparation == null ? null
                    : new TaskPreparationViewResponse(
                            preparation.requestId(), preparation.status(),
                            preparation.contentFingerprint(),
                            preparation.attemptCount(),
                            preparation.processingStartedAt(),
                            preparation.preparedAt(),
                            TaskPreparationErrorResponse.from(
                                    preparation.status(),
                                    preparation.lastErrorCode(),
                                    preparation.lastErrorDetail()),
                            preparation.updatedAt());
        }

        static TaskPreparationViewResponse from(
                TaskPreparationReceipt receipt
        ) {
            return new TaskPreparationViewResponse(
                    receipt.requestId(), receipt.status(),
                    receipt.contentFingerprint(), receipt.attemptCount(),
                    receipt.processingStartedAt(), receipt.preparedAt(),
                    TaskPreparationErrorResponse.from(
                            receipt.status(), receipt.lastErrorCode(),
                            receipt.lastErrorDetail()),
                    receipt.updatedAt());
        }
    }

    record TaskPreparationErrorResponse(
            String code,
            String detail,
            boolean retryable
    ) {
        static TaskPreparationErrorResponse from(
                TaskPreparationStatus status,
                String code,
                String detail
        ) {
            return code == null ? null : new TaskPreparationErrorResponse(
                    code, detail, status == TaskPreparationStatus.FAILED);
        }
    }

    record AdminTaskCapabilitiesResponse(
            boolean canEditContent,
            boolean canStartPreparation,
            boolean canSchedule,
            boolean canOpenNow
    ) {
        static AdminTaskCapabilitiesResponse from(
                AdminTaskQueryService.AdminTaskCapabilities capabilities
        ) {
            return new AdminTaskCapabilitiesResponse(
                    capabilities.canEditContent(),
                    capabilities.canStartPreparation(),
                    capabilities.canSchedule(),
                    capabilities.canOpenNow());
        }
    }

    record AdminTaskProgressSummaryResponse(
            UUID taskId,
            TaskStatus status,
            Instant observedAt,
            long submissionCount,
            List<AdminTaskOptionProgressResponse> options
    ) {
        static AdminTaskProgressSummaryResponse from(
                TaskProgressSummaryQueryService.TaskProgressSummary summary
        ) {
            return new AdminTaskProgressSummaryResponse(
                    summary.taskId().value(),
                    summary.status(),
                    summary.observedAt(),
                    summary.submissionCount(),
                    summary.options().stream()
                            .map(AdminTaskOptionProgressResponse::from)
                            .toList());
        }
    }

    record AdminTaskOptionProgressResponse(
            UUID optionId,
            String content,
            long count,
            double rate
    ) {
        static AdminTaskOptionProgressResponse from(
                TaskProgressSummaryQueryService.OptionProgress option
        ) {
            return new AdminTaskOptionProgressResponse(
                    option.optionId().value(), option.content(),
                    option.count(), option.rate());
        }
    }

    record AdminTaskProgressResponsesResponse(
            UUID taskId,
            TaskStatus status,
            Instant observedAt,
            List<AdminTaskProgressResponse> responses,
            String nextCursor,
            boolean hasMore
    ) {
        static AdminTaskProgressResponsesResponse from(
                TaskProgressResponsesQueryService.TaskProgressResponsePage page
        ) {
            return new AdminTaskProgressResponsesResponse(
                    page.taskId().value(), page.status(), page.observedAt(),
                    page.responses().stream()
                            .map(AdminTaskProgressResponse::from)
                            .toList(),
                    page.nextCursor(), page.hasMore());
        }
    }

    record AdminTaskProgressResponse(
            UUID selectedOptionId,
            String selectedOptionContent,
            TaskReasonSource reasonSource,
            String reason,
            Instant submittedAt
    ) {
        static AdminTaskProgressResponse from(
                TaskProgressResponsesQueryService.TaskProgressResponse response
        ) {
            return new AdminTaskProgressResponse(
                    response.selectedOptionId().value(),
                    response.selectedOptionContent(),
                    response.reasonSource(), response.reason(),
                    response.submittedAt());
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
