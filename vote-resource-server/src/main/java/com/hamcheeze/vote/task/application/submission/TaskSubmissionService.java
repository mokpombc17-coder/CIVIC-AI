package com.hamcheeze.vote.task.application.submission;

import com.hamcheeze.vote.shared.application.UserTransactionLock;
import com.hamcheeze.vote.task.application.idempotency.IdempotentTaskSubmissionExecutor;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyCommand;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyExecution;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyKey;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionRequestHashFactory;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionCompletedEventPublisher;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.common.TaskValidationException;
import com.hamcheeze.vote.task.domain.common.TaskViolation;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswerCommand;
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
    private final TaskSubmissionCompletedEventPublisher completedEvents;
    private final UserTransactionLock userTransactions;
    private final TaskSubmissionRequestHashFactory requestHashFactory =
            new TaskSubmissionRequestHashFactory();
    private final Clock clock;

    @Autowired
    public TaskSubmissionService(
            IdempotentTaskSubmissionExecutor idempotency,
            TaskSubmissionOutcomeCodec outcomeCodec,
            TaskRepository tasks,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionRepository predictions,
            TaskSubmissionRepository submissions,
            TaskSubmissionCompletedEventPublisher completedEvents,
            UserTransactionLock userTransactions
    ) {
        this(idempotency, outcomeCodec, tasks, currentPersonas,
                predictions, submissions, completedEvents, userTransactions,
                Clock.systemUTC());
    }

    TaskSubmissionService(
            IdempotentTaskSubmissionExecutor idempotency,
            TaskSubmissionOutcomeCodec outcomeCodec,
            TaskRepository tasks,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionRepository predictions,
            TaskSubmissionRepository submissions,
            TaskSubmissionCompletedEventPublisher completedEvents,
            UserTransactionLock userTransactions,
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
        this.completedEvents = Objects.requireNonNull(
                completedEvents, "completedEvents");
        this.userTransactions = Objects.requireNonNull(
                userTransactions, "userTransactions");
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
                                command.predictionId(),
                                command.answers()),
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

        userTransactions.lock(userId.value());
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

        TaskPrediction prediction = predictions
                .findById(command.predictionId())
                .orElse(null);
        if (prediction == null) {
            return rejection(
                    409,
                    "TASK_SUBMISSION_PREDICTION_UNAVAILABLE",
                    task.id(),
                    TaskViolation.of(
                            "TASK_SUBMISSION_PREDICTION_UNAVAILABLE",
                            "predictionId",
                            "prediction is unavailable for submission"));
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

        try {
            TaskSubmission submission = TaskSubmission.create(
                    new TaskSubmissionId(UUID.randomUUID()),
                    userId,
                    task,
                    prediction,
                    currentPersona.generationId(),
                    currentPersona.versionId(),
                    command.answers(),
                    submittedAt);
            TaskSubmission stored = submissions.insert(submission);
            completedEvents.publish(stored);
            return TaskSubmissionOutcome.submitted(stored);
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
        return code.contains("ANSWER") || code.contains("CANDIDATE")
                ? 422 : 409;
    }

    public record SubmitTaskCommand(
            TaskId taskId,
            TaskPredictionId predictionId,
            List<TaskSubmissionAnswerCommand> answers
    ) {
        public SubmitTaskCommand {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(predictionId, "predictionId");
            answers = List.copyOf(Objects.requireNonNull(
                    answers, "answers"));
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
