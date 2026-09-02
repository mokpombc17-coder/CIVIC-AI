package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionInputRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskValidationException;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionError;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.task.Task;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.hamcheeze.vote.task.infra.prediction.TaskPredictionMetrics;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
@ConditionalOnProperty(
        prefix = "vote.task.prediction",
        name = "enabled",
        havingValue = "true")
public class TaskPredictionStateService {

    private static final String INVALID_RESPONSE_CODE =
            "AI_RESPONSE_INVALID";

    private final TaskPredictionRepository predictions;
    private final TaskPredictionInputRepository inputs;
    private final TaskRepository tasks;
    private final TaskPredictionApplicationPolicy policy;
    private final Clock clock;
    private TaskPredictionMetrics metrics;

    @Autowired(required = false)
    void setMetrics(TaskPredictionMetrics metrics) {
        this.metrics = metrics;
    }

    @Autowired
    public TaskPredictionStateService(
            TaskPredictionRepository predictions,
            TaskPredictionInputRepository inputs,
            TaskRepository tasks,
            TaskPredictionApplicationPolicy policy
    ) {
        this(predictions, inputs, tasks, policy, Clock.systemUTC());
    }

    TaskPredictionStateService(
            TaskPredictionRepository predictions,
            TaskPredictionInputRepository inputs,
            TaskRepository tasks,
            TaskPredictionApplicationPolicy policy,
            Clock clock
    ) {
        this.predictions = Objects.requireNonNull(
                predictions, "predictions");
        this.inputs = Objects.requireNonNull(inputs, "inputs");
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public Optional<TaskPredictionDispatchClaim> claimNext() {
        return claimNext("unknown-worker");
    }

    @Transactional
    public Optional<TaskPredictionDispatchClaim> claimNext(String workerId) {
        Instant now = clock.instant();
        Optional<TaskPrediction> found =
                predictions.findNextDispatchableForUpdate(now);
        if (found.isEmpty()) {
            return Optional.empty();
        }

        TaskPrediction prediction = found.get();
        Task task = tasks.findById(prediction.taskId())
                .orElseThrow(() -> new IllegalStateException(
                        "prediction references a missing task"));
        if (!task.isOpenAt(now)) {
            prediction.failDeadline(new TaskPredictionError(
                    "TASK_PREDICTION_DEADLINE_EXPIRED",
                    "task deadline elapsed before prediction claim"), now);
            predictions.save(prediction);
            if (metrics != null) {
                TaskPredictionTransactionCallbacks.afterCommit(
                        metrics::deadlineExpired);
            }
            return Optional.empty();
        }
        final TaskPredictionInputSnapshot input;
        try {
            input = inputs.findByPredictionId(prediction.id())
                    .orElseThrow(() -> new TaskPredictionInputException(
                            TaskPredictionInputException.ErrorCode.INPUT_UNAVAILABLE,
                            "Task prediction input snapshot is missing"));
            validateInput(prediction, input);
        } catch (TaskPredictionInputException exception) {
            String code = exception.code()
                    == TaskPredictionInputException.ErrorCode
                    .FINGERPRINT_MISMATCH
                    ? "TASK_PREDICTION_INPUT_FINGERPRINT_MISMATCH"
                    : "TASK_PREDICTION_INPUT_INTEGRITY_ERROR";
            prediction.failDeadline(new TaskPredictionError(
                    code, exception.getMessage()), now);
            predictions.save(prediction);
            if (metrics != null) {
                TaskPredictionTransactionCallbacks.afterCommit(() -> {
                    if (exception.code()
                            == TaskPredictionInputException.ErrorCode
                            .FINGERPRINT_MISMATCH) {
                        metrics.fingerprintMismatch();
                    }
                    metrics.terminalFailure();
                });
            }
            return Optional.empty();
        }
        TaskPredictionAttemptId attemptId =
                new TaskPredictionAttemptId(UUID.randomUUID());
        int attemptNumber = prediction.startProcessing(
                attemptId, policy.retryPolicy(),
                policy.processingLeaseDuration(), now);
        PredictionCreationCommand command = new PredictionCreationCommand(
                prediction.requestId(),
                prediction.userId(),
                prediction.personaId(),
                task,
                prediction.candidatePolicyVersion(),
                input.requestSchemaVersion(),
                input.requestPayload(),
                input.requestFingerprint(),
                policy.retryPolicy().requestTimeout());
        SanitizedTaskPredictionPayload requestPayload =
                TaskPredictionPayloads.request(command);
        TaskPredictionAttempt attempt = TaskPredictionAttempt.started(
                attemptId,
                prediction.id(),
                attemptNumber,
                requestPayload,
                now,
                prediction.leaseExpiresAt(),
                workerId);

        predictions.save(prediction);
        predictions.saveAttempt(attempt);
        if (metrics != null) {
            TaskPredictionTransactionCallbacks.afterCommit(
                    metrics::claimSucceeded);
        }
        return Optional.of(new TaskPredictionDispatchClaim(
                prediction.id(),
                attempt.id(),
                attemptNumber,
                command,
                requestPayload));
    }

    @Transactional
    public boolean completeSuccess(
            TaskPredictionDispatchClaim claim,
            PredictionCreationResult result
    ) {
        Objects.requireNonNull(claim, "claim");
        Objects.requireNonNull(result, "result");
        Instant now = clock.instant();
        TaskPrediction prediction = requirePredictionForUpdate(
                claim.predictionId());
        TaskPredictionAttempt attempt = requireAttempt(claim);
        if (!isActiveClaim(prediction, attempt, claim)) {
            recordIgnored(
                    prediction,
                    attempt,
                    result.httpStatus(),
                    result.responsePayload(),
                    "DUPLICATE_OR_LATE_RESPONSE",
                    "prediction response arrived after the claim was final");
            return false;
        }

        String mismatch = responseMismatch(claim, result);
        if (mismatch != null) {
            failInvalidResponse(
                    prediction, attempt, result.httpStatus(),
                    result.responsePayload(), mismatch, now);
            return true;
        }

        Task task = tasks.findById(prediction.taskId())
                .orElseThrow(() -> new IllegalStateException(
                        "prediction references a missing task"));
        if (!task.isOpenAt(now)) {
            prediction.failPermanently(
                    new TaskPredictionError(
                            "TASK_PREDICTION_LATE_RESPONSE",
                            "prediction response arrived after task deadline"),
                    now);
            predictions.save(prediction);
            predictions.saveAttempt(attempt.complete(
                    TaskPredictionAttemptOutcome.IGNORED_LATE_RESPONSE,
                    result.httpStatus(), result.responsePayload(),
                    "TASK_PREDICTION_LATE_RESPONSE",
                    "prediction response arrived after task deadline", now));
            if (metrics != null) {
                TaskPredictionTransactionCallbacks.afterCommit(() -> {
                    metrics.lateResponseIgnored();
                    metrics.terminalFailure();
                });
            }
            return true;
        }
        try {
            prediction.succeed(task, result.predictedReasons(), now);
        } catch (TaskDomainException
                 | TaskValidationException
                 | IllegalArgumentException exception) {
            failInvalidResponse(
                    prediction, attempt, result.httpStatus(),
                    result.responsePayload(), exception.getMessage(), now);
            return true;
        }

        TaskPredictionAttempt completed = attempt.complete(
                TaskPredictionAttemptOutcome.SUCCEEDED,
                result.httpStatus(),
                result.responsePayload(),
                null,
                null,
                now);
        predictions.save(prediction);
        predictions.saveAttempt(completed);
        if (metrics != null) {
            TaskPredictionTransactionCallbacks.afterCommit(
                    metrics::predictionSucceeded);
        }
        return true;
    }

    @Transactional
    public boolean completeFailure(
            TaskPredictionDispatchClaim claim,
            PredictionCreationException failure
    ) {
        Objects.requireNonNull(claim, "claim");
        Objects.requireNonNull(failure, "failure");
        Instant now = clock.instant();
        TaskPrediction prediction = requirePredictionForUpdate(
                claim.predictionId());
        TaskPredictionAttempt attempt = requireAttempt(claim);
        if (!isActiveClaim(prediction, attempt, claim)) {
            recordIgnored(
                    prediction,
                    attempt,
                    failure.httpStatus(),
                    failure.responsePayload(),
                    failure.errorCode(),
                    failure.getMessage());
            return false;
        }

        String errorCode = bounded(
                failure.errorCode(), 200, "PREDICTION_CREATION_FAILED");
        String errorMessage = bounded(
                failure.getMessage(), 2_000, null);
        TaskPredictionError error = new TaskPredictionError(
                errorCode, errorMessage);
        if (failure.retryable()) {
            prediction.failAttempt(error, policy.retryPolicy(), now);
            Task task = tasks.findById(prediction.taskId())
                    .orElseThrow(() -> new IllegalStateException(
                            "prediction references a missing task"));
            if (prediction.nextRetryAt() != null
                    && !prediction.nextRetryAt().isBefore(
                            task.schedule().scheduledCloseAt())) {
                prediction.failDeadline(new TaskPredictionError(
                        "TASK_PREDICTION_DEADLINE_EXPIRED",
                        "next retry would start after task deadline"), now);
            }
        } else {
            prediction.failPermanently(error, now);
        }
        TaskPredictionAttempt completed = attempt.complete(
                failure.outcome(),
                failure.httpStatus(),
                failure.responsePayload(),
                errorCode,
                errorMessage,
                now);
        predictions.save(prediction);
        predictions.saveAttempt(completed);
        if (metrics != null) {
            boolean retryScheduled = prediction.status()
                    == TaskPredictionStatus.RETRY_WAIT;
            TaskPredictionTransactionCallbacks.afterCommit(() -> {
                if (retryScheduled) {
                    metrics.retryableFailure();
                } else {
                    metrics.terminalFailure();
                }
            });
        }
        return true;
    }

    @Transactional
    public void recordIgnoredResponse(
            TaskPredictionId predictionId,
            Integer httpStatus,
            SanitizedTaskPredictionPayload responsePayload,
            String reasonCode,
            String reasonMessage
    ) {
        TaskPrediction prediction = requirePredictionForUpdate(predictionId);
        TaskPredictionAttempt latest = predictions.findAttempts(prediction.id())
                .stream()
                .max(java.util.Comparator.comparingInt(
                        TaskPredictionAttempt::attemptNumber))
                .orElseThrow(() -> new IllegalStateException(
                        "task prediction attempt not found"));
        boolean firstObservation = predictions.markLateCompletionObserved(
                latest.id(), clock.instant());
        if (metrics != null && firstObservation) {
            TaskPredictionTransactionCallbacks.afterCommit(
                    metrics::staleCompletionIgnored);
        }
    }

    private void failInvalidResponse(
            TaskPrediction prediction,
            TaskPredictionAttempt attempt,
            int httpStatus,
            SanitizedTaskPredictionPayload responsePayload,
            String message,
            Instant now
    ) {
        String safeMessage = message == null || message.isBlank()
                ? "prediction response failed validation"
                : message;
        prediction.failPermanently(
                new TaskPredictionError(
                        INVALID_RESPONSE_CODE, safeMessage),
                now);
        predictions.save(prediction);
        predictions.saveAttempt(attempt.complete(
                TaskPredictionAttemptOutcome.INVALID_RESPONSE,
                httpStatus,
                responsePayload,
                INVALID_RESPONSE_CODE,
                safeMessage,
                now));
        if (metrics != null) {
            TaskPredictionTransactionCallbacks.afterCommit(
                    metrics::terminalFailure);
        }
    }

    private void recordIgnored(
            TaskPrediction prediction,
            TaskPredictionAttempt attempt,
            Integer httpStatus,
            SanitizedTaskPredictionPayload responsePayload,
            String reasonCode,
            String reasonMessage
    ) {
        Instant now = clock.instant();
        String safeCode = bounded(
                reasonCode, 200, "IGNORED_LATE_RESPONSE");
        String safeMessage = bounded(reasonMessage, 2_000, null);
        if (!attempt.outcome().completed()) {
            predictions.saveAttempt(attempt.complete(
                    TaskPredictionAttemptOutcome.IGNORED_LATE_RESPONSE,
                    httpStatus,
                    responsePayload,
                    safeCode,
                    safeMessage,
                    now));
            if (metrics != null) {
                TaskPredictionTransactionCallbacks.afterCommit(
                        metrics::staleCompletionIgnored);
            }
            return;
        }
        boolean firstObservation = predictions.markLateCompletionObserved(
                attempt.id(), now);
        if (metrics != null && firstObservation) {
            TaskPredictionTransactionCallbacks.afterCommit(
                    metrics::staleCompletionIgnored);
        }
    }

    private TaskPrediction requirePredictionForUpdate(
            TaskPredictionId predictionId
    ) {
        return predictions.findByIdForUpdate(predictionId)
                .orElseThrow(() -> new IllegalStateException(
                        "task prediction not found"));
    }

    private TaskPredictionAttempt requireAttempt(
            TaskPredictionDispatchClaim claim
    ) {
        return predictions.findAttempts(claim.predictionId()).stream()
                .filter(attempt -> attempt.id().equals(claim.attemptId()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "task prediction attempt not found"));
    }

    private static boolean isActiveClaim(
            TaskPrediction prediction,
            TaskPredictionAttempt attempt,
            TaskPredictionDispatchClaim claim
    ) {
        return prediction.status() == TaskPredictionStatus.PROCESSING
                && !attempt.outcome().completed()
                && prediction.hasActiveAttempt(
                        claim.attemptId(), claim.attemptNumber())
                && attempt.attemptNumber() == claim.attemptNumber();
    }

    private static void validateInput(
            TaskPrediction prediction,
            TaskPredictionInputSnapshot input
    ) {
        if (!input.predictionId().equals(prediction.id())
                || !input.taskId().equals(prediction.taskId())
                || !input.userId().equals(prediction.userId())
                || !input.personaGenerationId().equals(
                        prediction.personaGenerationId())
                || !input.providerPersonaId().equals(prediction.personaId())) {
            throw new TaskPredictionInputException(
                    TaskPredictionInputException.ErrorCode.INTEGRITY_ERROR,
                    "Task prediction input metadata does not match prediction");
        }
    }

    private static String responseMismatch(
            TaskPredictionDispatchClaim claim,
            PredictionCreationResult result
    ) {
        if (!claim.predictionId().equals(result.requestId())) {
            return "response requestId does not match prediction requestId";
        }
        if (!claim.command().task().id().equals(result.taskId())) {
            return "response taskId does not match requested taskId";
        }
        return null;
    }

    private static String bounded(
            String value,
            int maximumLength,
            String fallback
    ) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String normalized = value.strip();
        return normalized.length() <= maximumLength
                ? normalized
                : normalized.substring(0, maximumLength);
    }
}
