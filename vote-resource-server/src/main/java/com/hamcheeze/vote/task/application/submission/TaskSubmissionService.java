package com.hamcheeze.vote.task.application.submission;

import com.hamcheeze.vote.shared.application.UserTransactionLock;
import com.hamcheeze.vote.task.application.idempotency.IdempotentTaskSubmissionExecutor;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyCommand;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyExecution;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyKey;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionRequestHashFactory;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionTransactionCallbacks;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.common.TaskValidationException;
import com.hamcheeze.vote.task.domain.common.TaskViolation;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswerCommand;
import com.hamcheeze.vote.task.domain.submission.WriteTaskReason;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictedReason;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionAvailability;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskAvailability;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class TaskSubmissionService {

    private final IdempotentTaskSubmissionExecutor idempotency;
    private final TaskSubmissionOutcomeCodec outcomeCodec;
    private final TaskRepository tasks;
    private final CurrentTaskPersonaQueryPort currentPersonas;
    private final TaskPredictionRepository predictions;
    private final TaskSubmissionRepository submissions;
    private final UserTransactionLock userTransactions;
    private final TaskPredictionAvailability predictionAvailability;
    private final TaskSubmissionRequestHashFactory requestHashFactory =
            new TaskSubmissionRequestHashFactory();
    private final Clock clock;
    private TaskSubmissionMetrics metrics;

    @Autowired(required = false)
    void setMetrics(TaskSubmissionMetrics metrics) {
        this.metrics = metrics;
    }

    @Autowired
    public TaskSubmissionService(
            IdempotentTaskSubmissionExecutor idempotency,
            TaskSubmissionOutcomeCodec outcomeCodec,
            TaskRepository tasks,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionRepository predictions,
            TaskSubmissionRepository submissions,
            UserTransactionLock userTransactions,
            TaskPredictionAvailability predictionAvailability
    ) {
        this(idempotency, outcomeCodec, tasks, currentPersonas,
                predictions, submissions, userTransactions,
                predictionAvailability,
                Clock.systemUTC());
    }

    TaskSubmissionService(
            IdempotentTaskSubmissionExecutor idempotency,
            TaskSubmissionOutcomeCodec outcomeCodec,
            TaskRepository tasks,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionRepository predictions,
            TaskSubmissionRepository submissions,
            UserTransactionLock userTransactions,
            TaskPredictionAvailability predictionAvailability,
            Clock clock
    ) {
        this.idempotency = Objects.requireNonNull(
                idempotency, "idempotency");
        this.outcomeCodec = Objects.requireNonNull(
                outcomeCodec, "outcomeCodec");
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.currentPersonas = Objects.requireNonNull(
                currentPersonas, "currentPersonas");
        this.predictions = Objects.requireNonNull(
                predictions, "predictions");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.userTransactions = Objects.requireNonNull(
                userTransactions, "userTransactions");
        this.predictionAvailability = Objects.requireNonNull(
                predictionAvailability, "predictionAvailability");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public SubmissionExecution submit(
            TaskUserId authenticatedUserId,
            String idempotencyKey,
            SubmitTaskCommand command
    ) {
        Objects.requireNonNull(authenticatedUserId, "authenticatedUserId");
        Objects.requireNonNull(command, "command");
        TaskIdempotencyCommand receiptCommand =
                new TaskIdempotencyCommand(
                        authenticatedUserId,
                        TaskIdempotencyKey.parse(idempotencyKey),
                        requestHashFactory.hash(
                                command.taskId(),
                                command.personaGenerationId(),
                                command.personaVersionId(),
                                command.predictionId(),
                                command.answer()),
                        TaskSubmissionOutcomeCodec.SCHEMA_VERSION);
        TaskIdempotencyExecution<TaskSubmissionOutcome> execution =
                idempotency.execute(
                        receiptCommand,
                        outcomeCodec,
                        () -> submitInReceiptTransaction(
                                authenticatedUserId, command));
        return new SubmissionExecution(
                execution.result(), execution.replayed());
    }

    private TaskSubmissionOutcome submitInReceiptTransaction(
            TaskUserId userId,
            SubmitTaskCommand command
    ) {
        userTransactions.lock(userId.value());
        Task task = tasks.findByIdForUpdate(command.taskId())
                .orElse(null);
        if (task == null) {
            return rejection(
                    409,
                    "TASK_SUBMISSION_TASK_UNAVAILABLE",
                    command.taskId(),
                    TaskViolation.of(
                            "TASK_SUBMISSION_TASK_UNAVAILABLE",
                            "taskId",
                            "task is unavailable for submission"));
        }

        Instant submittedAt = clock.instant();
        TaskAvailability availability = task.availabilityAt(submittedAt);
        if (availability != TaskAvailability.OPEN) {
            String code = availability == TaskAvailability.CLOSED
                    ? "TASK_SUBMISSION_TASK_CLOSED"
                    : "TASK_SUBMISSION_TASK_UNPUBLISHED";
            return rejection(
                    409,
                    code,
                    task.id(),
                    TaskViolation.of(
                            code,
                            "task.status",
                            "submission is allowed only while task is open"));
        }

        CurrentTaskPersona currentPersona = currentPersonas
                .findCurrentUsable(userId)
                .orElse(null);
        if (currentPersona == null) {
            return rejection(
                    409,
                    "TASK_CURRENT_PERSONA_NOT_READY",
                    task.id(),
                    TaskViolation.of(
                            "TASK_CURRENT_PERSONA_NOT_READY",
                            "userId",
                            "a current usable persona is required"));
        }

        if (command.personaGenerationId() != null
                && (!command.personaGenerationId().equals(
                        currentPersona.generationId())
                || !command.personaVersionId().equals(
                        currentPersona.versionId()))) {
            return rejection(
                    409,
                    "TASK_SUBMISSION_PERSONA_MISMATCH",
                    task.id(),
                    TaskViolation.of(
                            "TASK_SUBMISSION_PERSONA_MISMATCH",
                            "personaVersionId",
                            "requested persona is not the current usable persona"));
        }

        if (submissions.findByUserAndTask(userId, task.id()).isPresent()) {
            return rejection(
                    409,
                    "TASK_ALREADY_SUBMITTED",
                    task.id(),
                    TaskViolation.of(
                            "TASK_ALREADY_SUBMITTED",
                            "taskId",
                            "user already submitted this task"));
        }

        if (command.answer() instanceof AcceptTaskPredictedReason
                && !predictionAvailability.enabled()) {
            return rejection(
                    409,
                    "TASK_PREDICTION_DISABLED",
                    task.id(),
                    TaskViolation.of(
                            "TASK_PREDICTION_DISABLED",
                            "reasonSource",
                            "AI_ACCEPTED is unavailable while prediction is disabled"));
        }

        TaskPrediction prediction = command.predictionId() == null
                ? null
                : predictions.findById(command.predictionId()).orElse(null);
        if (command.predictionId() != null && prediction == null) {
            return rejection(
                    409,
                    "TASK_SUBMISSION_PREDICTION_UNAVAILABLE",
                    task.id(),
                    TaskViolation.of(
                            "TASK_SUBMISSION_PREDICTION_UNAVAILABLE",
                            "predictionId",
                            "prediction is unavailable for submission"));
        }

        try {
            TaskSubmission submission = TaskSubmission.create(
                    new TaskSubmissionId(UUID.randomUUID()),
                    userId,
                    task,
                    prediction,
                    currentPersona.generationId(),
                    currentPersona.versionId(),
                    command.answer(),
                    submittedAt);
            TaskSubmission stored = submissions.insert(submission);
            TaskSubmissionOutcome outcome =
                    TaskSubmissionOutcome.submitted(stored);
            recordSubmissionMetricAfterCommit(metricObservation(
                    command.answer(), prediction));
            return outcome;
        } catch (TaskValidationException exception) {
            return TaskSubmissionOutcome.rejected(
                    422,
                    "TASK_SUBMISSION_VALIDATION_FAILED",
                    task.id(),
                    exception.violations());
        } catch (TaskDomainException exception) {
            TaskViolation violation = exception.violation();
            return rejection(
                    domainStatus(violation.code()),
                    violation.code(),
                    task.id(),
                    violation);
        }
    }

    private TaskSubmissionMetricObservation metricObservation(
            TaskSubmissionAnswerCommand answer,
            TaskPrediction prediction
    ) {
        if (answer instanceof AcceptTaskPredictedReason) {
            return TaskSubmissionMetricObservation.AI_ACCEPTED;
        }
        if (!(answer instanceof WriteTaskReason)) {
            return TaskSubmissionMetricObservation.NONE;
        }
        if (prediction == null) {
            return TaskSubmissionMetricObservation
                    .DIRECT_WITHOUT_PREDICTION;
        }
        return prediction.status().terminal()
                ? TaskSubmissionMetricObservation.NONE
                : TaskSubmissionMetricObservation
                        .DIRECT_WITH_NON_TERMINAL_PREDICTION;
    }

    private void recordSubmissionMetricAfterCommit(
            TaskSubmissionMetricObservation observation
    ) {
        TaskSubmissionMetrics currentMetrics = metrics;
        if (currentMetrics == null
                || observation == TaskSubmissionMetricObservation.NONE) {
            return;
        }
        Runnable action = switch (observation) {
            case AI_ACCEPTED -> currentMetrics::aiAccepted;
            case DIRECT_WITHOUT_PREDICTION ->
                    currentMetrics::directWithoutPrediction;
            case DIRECT_WITH_NON_TERMINAL_PREDICTION ->
                    currentMetrics::directWhilePredictionNonTerminal;
            case NONE -> throw new IllegalStateException(
                    "NONE metric observation must not be registered");
        };
        TaskPredictionTransactionCallbacks.afterCommit(
                "task-submission-" + observation.name(),
                action);
    }

    private enum TaskSubmissionMetricObservation {
        NONE,
        AI_ACCEPTED,
        DIRECT_WITHOUT_PREDICTION,
        DIRECT_WITH_NON_TERMINAL_PREDICTION
    }

    private static TaskSubmissionOutcome rejection(
            int status,
            String code,
            TaskId taskId,
            TaskViolation violation
    ) {
        return TaskSubmissionOutcome.rejected(
                status, code, taskId, List.of(violation));
    }

    private static int domainStatus(String code) {
        return code.contains("ANSWER") || code.contains("REASON")
                || code.contains("OPTION") || code.contains("QUESTION")
                ? 422 : 409;
    }

    public record SubmitTaskCommand(
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskPredictionId predictionId,
            TaskSubmissionAnswerCommand answer
    ) {
        public SubmitTaskCommand {
            Objects.requireNonNull(taskId, "taskId");
            if ((personaGenerationId == null) != (personaVersionId == null)) {
                throw new IllegalArgumentException(
                        "persona generation and version must be provided together");
            }
            Objects.requireNonNull(answer, "answer");
        }

        public SubmitTaskCommand(
                TaskId taskId,
                TaskPredictionId predictionId,
                TaskSubmissionAnswerCommand answer
        ) {
            this(taskId, null, null, predictionId, answer);
        }
    }

    public record SubmissionExecution(
            TaskSubmissionOutcome outcome,
            boolean replayed
    ) {
        public SubmissionExecution {
            Objects.requireNonNull(outcome, "outcome");
        }
    }
}
