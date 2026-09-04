package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionAvailability;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRuntimeStatus;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.TaskAvailability;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

@Service
public class TaskPredictionQueryService {

    private final TaskRepository tasks;
    private final CurrentTaskPersonaQueryPort currentPersonas;
    private final TaskPredictionRepository predictions;
    private final TaskSubmissionRepository submissions;
    private final TaskPredictionAvailability predictionAvailability;
    private final Clock clock;

    @Autowired
    public TaskPredictionQueryService(
            TaskRepository tasks,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionRepository predictions,
            TaskSubmissionRepository submissions,
            TaskPredictionAvailability predictionAvailability
    ) {
        this(tasks, currentPersonas, predictions, submissions,
                predictionAvailability,
                Clock.systemUTC());
    }

    TaskPredictionQueryService(
            TaskRepository tasks,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionRepository predictions,
            TaskSubmissionRepository submissions,
            TaskPredictionAvailability predictionAvailability,
            Clock clock
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.currentPersonas = Objects.requireNonNull(
                currentPersonas, "currentPersonas");
        this.predictions = Objects.requireNonNull(
                predictions, "predictions");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.predictionAvailability = Objects.requireNonNull(
                predictionAvailability, "predictionAvailability");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    TaskPredictionQueryService(
            TaskRepository tasks,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionRepository predictions,
            TaskSubmissionRepository submissions,
            Clock clock
    ) {
        this(tasks, currentPersonas, predictions, submissions,
                new TaskPredictionAvailability(true), clock);
    }

    @Transactional(readOnly = true)
    public TaskPredictionView findCurrent(
            TaskUserId userId,
            TaskId taskId
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(taskId, "taskId");
        var task = tasks.findById(taskId).orElse(null);
        if (task == null) {
            return TaskPredictionView.unavailable(
                    taskId, TaskPredictionViewState.TASK_NOT_FOUND,
                    predictionAvailability.enabled());
        }
        TaskAvailability availability = task.availabilityAt(clock.instant());
        if (availability != TaskAvailability.OPEN) {
            return TaskPredictionView.unavailable(
                    taskId,
                    availability == TaskAvailability.CLOSED
                            ? TaskPredictionViewState.TASK_CLOSED
                            : TaskPredictionViewState.TASK_UNPUBLISHED,
                    predictionAvailability.enabled());
        }

        var submission = submissions.findByUserAndTask(userId, taskId)
                .orElse(null);
        if (submission != null) {
            return TaskPredictionView.submitted(
                    taskId, submission.id(),
                    predictionAvailability.enabled());
        }

        CurrentTaskPersona persona = currentPersonas
                .findCurrentUsable(userId)
                .orElse(null);
        if (persona == null) {
            return TaskPredictionView.unavailable(
                    taskId, TaskPredictionViewState.PERSONA_NOT_READY,
                    predictionAvailability.enabled());
        }

        TaskPrediction prediction = predictions.findByIdentity(
                        userId, taskId, persona.generationId())
                .orElse(null);
        if (prediction == null) {
            return TaskPredictionView.notRequested(
                    taskId, persona, predictionAvailability.enabled());
        }
        return TaskPredictionView.from(
                taskId, persona, prediction, predictionAvailability.enabled());
    }

    public enum TaskPredictionViewState {
        TASK_NOT_FOUND,
        TASK_UNPUBLISHED,
        TASK_CLOSED,
        ALREADY_SUBMITTED,
        PERSONA_NOT_READY,
        NOT_REQUESTED,
        PENDING,
        PROCESSING,
        REMOTE_PROCESSING,
        RETRY_WAIT,
        SUCCEEDED,
        FAILED
    }

    public record TaskPredictionView(
            TaskId taskId,
            TaskPredictionViewState state,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaId personaId,
            TaskPredictionId predictionId,
            TaskPredictionStatus predictionStatus,
            List<TaskPredictedReason> predictedReasons,
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
            TaskSubmissionId submissionId,
            Instant nextRetryAt,
            Instant completedAt,
            String failureCode,
            TaskPredictionRuntimeStatus runtimeStatus
    ) {
        public TaskPredictionView {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(state, "state");
            predictedReasons = List.copyOf(Objects.requireNonNull(
                    predictedReasons, "predictedReasons"));
            allowedReasonSources = List.copyOf(Objects.requireNonNull(
                    allowedReasonSources, "allowedReasonSources"));
        }

        public TaskPredictionView(
                TaskId taskId,
                TaskPredictionViewState state,
                TaskPersonaGenerationId personaGenerationId,
                TaskPersonaId personaId,
                TaskPredictionId predictionId,
                TaskPredictionStatus predictionStatus,
                List<TaskPredictedReason> predictedReasons,
                boolean waiting,
                boolean predictionRequestAllowed,
                boolean submissionAllowed,
                boolean predictedAnswerAllowed,
                boolean directAnswerAllowed,
                List<TaskReasonSource> allowedReasonSources,
                TaskSubmissionId submissionId,
                Instant nextRetryAt,
                Instant completedAt,
                String failureCode
        ) {
            this(taskId, state, personaGenerationId,
                    personaId, predictionId, predictionStatus,
                    predictedReasons, true, waiting,
                    predictionRequestAllowed, null, submissionAllowed,
                    predictedAnswerAllowed, predictedAnswerAllowed,
                    directAnswerAllowed,
                    predictionStatus == TaskPredictionStatus.RETRY_WAIT,
                    allowedReasonSources, submissionId, nextRetryAt,
                    completedAt, failureCode, null);
        }

        static TaskPredictionView unavailable(
                TaskId taskId,
                TaskPredictionViewState state,
                boolean predictionFeatureEnabled
        ) {
            return base(taskId, state, null, null,
                    null, null, List.of(), predictionFeatureEnabled,
                    false, false,
                    null, false, false, false, false, false, List.of(), null,
                    null, null, null, null);
        }

        static TaskPredictionView submitted(
                TaskId taskId,
                TaskSubmissionId submissionId,
                boolean predictionFeatureEnabled
        ) {
            return base(taskId, TaskPredictionViewState.ALREADY_SUBMITTED,
                    null, null, null, null, List.of(),
                    predictionFeatureEnabled,
                    false, false, null, false, false, false, false, false,
                    List.of(),
                    submissionId, null, null, null, null);
        }

        static TaskPredictionView notRequested(
                TaskId taskId,
                CurrentTaskPersona persona,
                boolean predictionFeatureEnabled
        ) {
            return base(taskId, TaskPredictionViewState.NOT_REQUESTED,
                    persona.generationId(), persona.personaId(),
                    null, null, List.of(), predictionFeatureEnabled, false,
                    predictionFeatureEnabled,
                    predictionFeatureEnabled ? null : "TASK_PREDICTION_DISABLED",
                    false, false, false, false, false,
                    List.of(), null,
                    null, null, null, null);
        }

        static TaskPredictionView from(
                TaskId taskId,
                CurrentTaskPersona persona,
                TaskPrediction prediction,
                boolean predictionFeatureEnabled
        ) {
            TaskPredictionStatus status = prediction.status();
            TaskPredictionViewState viewState =
                    status == TaskPredictionStatus.PENDING
                            && prediction.runtimeStatus() != null
                            ? TaskPredictionViewState.REMOTE_PROCESSING
                            : TaskPredictionViewState.valueOf(status.name());
            if (!predictionFeatureEnabled) {
                return base(
                        taskId,
                        viewState,
                        persona.generationId(),
                        persona.personaId(),
                        prediction.id(),
                        status,
                        List.of(),
                        false,
                        false,
                        false,
                        "TASK_PREDICTION_DISABLED",
                        false,
                        false,
                        false,
                        false,
                        false,
                        List.of(),
                        null,
                        null,
                        prediction.completedAt(),
                        prediction.lastError() == null
                                ? null : prediction.lastError().code(),
                        prediction.runtimeStatus());
            }
            boolean succeeded = status == TaskPredictionStatus.SUCCEEDED;
            boolean waiting = !status.terminal();
            List<TaskReasonSource> sources = succeeded
                    ? List.of(TaskReasonSource.AI_ACCEPTED,
                    TaskReasonSource.USER_WRITTEN)
                    : List.of();
            return base(
                    taskId,
                    viewState,
                    persona.generationId(),
                    persona.personaId(),
                    prediction.id(),
                    status,
                    succeeded ? prediction.predictedReasons() : List.of(),
                    predictionFeatureEnabled,
                    waiting,
                    false,
                    predictionFeatureEnabled ? null : "TASK_PREDICTION_DISABLED",
                    succeeded,
                    succeeded,
                    succeeded,
                    succeeded,
                    prediction.runtimeStatus() == null
                            ? status == TaskPredictionStatus.RETRY_WAIT
                            : prediction.runtimeStatus().retryable(),
                    sources,
                    null,
                    prediction.nextRetryAt(),
                    prediction.completedAt(),
                    prediction.lastError() == null
                            ? null : prediction.lastError().code(),
                    prediction.runtimeStatus());
        }

        private static TaskPredictionView base(
                TaskId taskId,
                TaskPredictionViewState state,
                TaskPersonaGenerationId personaGenerationId,
                TaskPersonaId personaId,
                TaskPredictionId predictionId,
                TaskPredictionStatus predictionStatus,
                List<TaskPredictedReason> predictedReasons,
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
                TaskSubmissionId submissionId,
                Instant nextRetryAt,
                Instant completedAt,
                String failureCode,
                TaskPredictionRuntimeStatus runtimeStatus
        ) {
            return new TaskPredictionView(
                    taskId, state, personaGenerationId,
                    personaId, predictionId, predictionStatus,
                    predictedReasons, predictionFeatureEnabled, waiting,
                    predictionRequestAllowed, predictionUnavailableReason,
                    submissionAllowed, predictedAnswerAllowed,
                    aiAcceptanceAllowed, directAnswerAllowed, retryable,
                    allowedReasonSources, submissionId, nextRetryAt,
                    completedAt, failureCode, runtimeStatus);
        }
    }
}
