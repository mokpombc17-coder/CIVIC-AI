package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskText;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;

import java.time.Instant;
import java.time.Duration;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class TaskPrediction {

    private final TaskPredictionId id;
    private final TaskUserId userId;
    private final TaskId taskId;
    private final TaskPersonaGenerationId personaGenerationId;
    private final TaskPersonaId personaId;
    private final String candidatePolicyVersion;
    private TaskPredictionStatus status;
    private int attemptCount;
    private List<TaskPredictedReason> predictedReasons;
    private Instant nextRetryAt;
    private TaskPredictionError lastError;
    private final Instant createdAt;
    private Instant startedAt;
    private Instant completedAt;
    private TaskPredictionAttemptId activeAttemptId;
    private Instant processingStartedAt;
    private Instant leaseExpiresAt;

    private TaskPrediction(
            TaskPredictionId id,
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaId personaId,
            String candidatePolicyVersion,
            TaskPredictionStatus status,
            int attemptCount,
            List<TaskPredictedReason> predictedReasons,
            Instant nextRetryAt,
            TaskPredictionError lastError,
            Instant createdAt,
            Instant startedAt,
            Instant completedAt,
            TaskPredictionAttemptId activeAttemptId,
            Instant processingStartedAt,
            Instant leaseExpiresAt
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.userId = Objects.requireNonNull(userId, "userId");
        this.taskId = Objects.requireNonNull(taskId, "taskId");
        this.personaGenerationId = Objects.requireNonNull(
                personaGenerationId, "personaGenerationId");
        this.personaId = Objects.requireNonNull(personaId, "personaId");
        this.candidatePolicyVersion = TaskText.required(
                candidatePolicyVersion,
                100,
                "TASK_PREDICTION_CANDIDATE_POLICY_VERSION",
                "candidatePolicyVersion");
        this.status = Objects.requireNonNull(status, "status");
        if (attemptCount < 0) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_ATTEMPT_COUNT_INVALID",
                    "attemptCount",
                    "attemptCount must not be negative");
        }
        this.attemptCount = attemptCount;
        this.predictedReasons = immutablePredictedReasons(predictedReasons);
        this.nextRetryAt = nextRetryAt;
        this.lastError = lastError;
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.startedAt = startedAt;
        this.completedAt = completedAt;
        this.activeAttemptId = activeAttemptId;
        this.processingStartedAt = processingStartedAt;
        this.leaseExpiresAt = leaseExpiresAt;
        validateConsistency();
    }

    public static TaskPrediction pending(
            TaskPredictionId id,
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaId personaId,
            String candidatePolicyVersion,
            Instant createdAt
    ) {
        return new TaskPrediction(
                id, userId, taskId, personaGenerationId,
                personaId,
                candidatePolicyVersion,
                TaskPredictionStatus.PENDING, 0, List.of(), null, null,
                createdAt, null, null, null, null, null);
    }

    public static TaskPrediction restore(
            TaskPredictionId id,
            TaskUserId userId,
            Task task,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaId personaId,
            String candidatePolicyVersion,
            TaskPredictionStatus status,
            int attemptCount,
            List<TaskPredictedReason> predictedReasons,
            Instant nextRetryAt,
            TaskPredictionError lastError,
            Instant createdAt,
            Instant startedAt,
            Instant completedAt,
            TaskPredictionAttemptId activeAttemptId,
            Instant processingStartedAt,
            Instant leaseExpiresAt
    ) {
        Objects.requireNonNull(task, "task");
        TaskPrediction restored = new TaskPrediction(
                id, userId, task.id(), personaGenerationId,
                personaId,
                candidatePolicyVersion, status,
                attemptCount, predictedReasons, nextRetryAt, lastError,
                createdAt, startedAt, completedAt,
                activeAttemptId, processingStartedAt, leaseExpiresAt);
        if (status == TaskPredictionStatus.SUCCEEDED) {
            restored.predictedReasons = restored.validatePredictedReasons(
                    task, predictedReasons);
        }
        return restored;
    }

    public int startProcessing(
            TaskPredictionAttemptId attemptId,
            TaskPredictionRetryPolicy retryPolicy,
            Duration processingLeaseDuration,
            Instant occurredAt
    ) {
        Objects.requireNonNull(attemptId, "attemptId");
        Objects.requireNonNull(retryPolicy, "retryPolicy");
        Objects.requireNonNull(
                processingLeaseDuration, "processingLeaseDuration");
        if (processingLeaseDuration.isZero()
                || processingLeaseDuration.isNegative()) {
            throw new IllegalArgumentException(
                    "processingLeaseDuration must be positive");
        }
        requireTime(occurredAt);
        if (status != TaskPredictionStatus.PENDING
                && status != TaskPredictionStatus.RETRY_WAIT) {
            throw transitionNotAllowed("start processing");
        }
        if (status == TaskPredictionStatus.RETRY_WAIT
                && occurredAt.isBefore(nextRetryAt)) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_RETRY_NOT_DUE",
                    "occurredAt",
                    "retry wait has not elapsed");
        }
        if (attemptCount >= retryPolicy.maximumAttempts()) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_ATTEMPTS_EXHAUSTED",
                    "attemptCount",
                    "maximum attempts have been exhausted");
        }
        status = TaskPredictionStatus.PROCESSING;
        attemptCount++;
        if (startedAt == null) {
            startedAt = occurredAt;
        }
        nextRetryAt = null;
        lastError = null;
        activeAttemptId = attemptId;
        processingStartedAt = occurredAt;
        leaseExpiresAt = occurredAt.plus(processingLeaseDuration);
        return attemptCount;
    }

    /** Compatibility entry point for domain fixtures created before leases. */
    public int startProcessing(
            TaskPredictionRetryPolicy retryPolicy,
            Instant occurredAt
    ) {
        return startProcessing(
                new TaskPredictionAttemptId(java.util.UUID.randomUUID()),
                retryPolicy, Duration.ofSeconds(90), occurredAt);
    }

    /** Compatibility restore entry point for non-processing legacy fixtures. */
    public static TaskPrediction restore(
            TaskPredictionId id,
            TaskUserId userId,
            Task task,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaId personaId,
            String candidatePolicyVersion,
            TaskPredictionStatus status,
            int attemptCount,
            List<TaskPredictedReason> predictedReasons,
            Instant nextRetryAt,
            TaskPredictionError lastError,
            Instant createdAt,
            Instant startedAt,
            Instant completedAt
    ) {
        TaskPredictionAttemptId activeId = status == TaskPredictionStatus.PROCESSING
                ? new TaskPredictionAttemptId(java.util.UUID.nameUUIDFromBytes(
                        (id.value() + ":" + attemptCount)
                                .getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                : null;
        Instant processingAt = status == TaskPredictionStatus.PROCESSING
                ? Objects.requireNonNull(startedAt, "startedAt") : null;
        Instant leaseUntil = processingAt == null
                ? null : processingAt.plusSeconds(90);
        return restore(id, userId, task, personaGenerationId,
                personaId, candidatePolicyVersion,
                status, attemptCount, predictedReasons, nextRetryAt,
                lastError, createdAt, startedAt, completedAt,
                activeId, processingAt, leaseUntil);
    }

    public void failAttempt(
            TaskPredictionError error,
            TaskPredictionRetryPolicy retryPolicy,
            Instant occurredAt
    ) {
        requireStatus(TaskPredictionStatus.PROCESSING, "fail attempt");
        Objects.requireNonNull(error, "error");
        Objects.requireNonNull(retryPolicy, "retryPolicy");
        requireTime(occurredAt);
        lastError = error;
        if (attemptCount < retryPolicy.maximumAttempts()) {
            status = TaskPredictionStatus.RETRY_WAIT;
            nextRetryAt = occurredAt.plus(retryPolicy.retryDelay());
            clearActiveAttempt();
            return;
        }
        status = TaskPredictionStatus.FAILED;
        nextRetryAt = null;
        completedAt = occurredAt;
        clearActiveAttempt();
    }

    public void failPermanently(
            TaskPredictionError error,
            Instant occurredAt
    ) {
        requireStatus(TaskPredictionStatus.PROCESSING, "fail permanently");
        Objects.requireNonNull(error, "error");
        requireTime(occurredAt);
        status = TaskPredictionStatus.FAILED;
        lastError = error;
        nextRetryAt = null;
        completedAt = occurredAt;
        clearActiveAttempt();
    }

    public void succeed(
            Task task,
            List<TaskPredictedReason> successfulReasons,
            Instant occurredAt
    ) {
        requireStatus(TaskPredictionStatus.PROCESSING, "succeed");
        requireTime(occurredAt);
        Objects.requireNonNull(task, "task");
        if (!task.id().equals(taskId)) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_TASK_MISMATCH",
                    "taskId",
                    "task does not match prediction");
        }
        List<TaskPredictedReason> validated =
                validatePredictedReasons(task, successfulReasons);
        predictedReasons = validated;
        status = TaskPredictionStatus.SUCCEEDED;
        nextRetryAt = null;
        lastError = null;
        completedAt = occurredAt;
        clearActiveAttempt();
    }

    public void failDeadline(
            TaskPredictionError error,
            Instant occurredAt
    ) {
        if (status.terminal()) {
            return;
        }
        Objects.requireNonNull(error, "error");
        requireTime(occurredAt);
        status = TaskPredictionStatus.FAILED;
        lastError = error;
        nextRetryAt = null;
        if (startedAt == null) {
            startedAt = occurredAt;
        }
        completedAt = occurredAt;
        clearActiveAttempt();
    }

    public void expireLease(
            TaskPredictionAttemptId attemptId,
            TaskPredictionRetryPolicy retryPolicy,
            Instant occurredAt
    ) {
        Objects.requireNonNull(attemptId, "attemptId");
        requireStatus(TaskPredictionStatus.PROCESSING, "expire lease");
        requireTime(occurredAt);
        if (!attemptId.equals(activeAttemptId)) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_ATTEMPT_MISMATCH",
                    "attemptId",
                    "attempt does not own the processing lease");
        }
        if (leaseExpiresAt == null || occurredAt.isBefore(leaseExpiresAt)) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_LEASE_NOT_EXPIRED",
                    "occurredAt",
                    "processing lease has not expired");
        }
        failAttempt(new TaskPredictionError(
                "TASK_PREDICTION_PROCESSING_LEASE_EXPIRED",
                "task prediction processing lease expired"),
                retryPolicy, occurredAt);
    }

    public boolean hasActiveAttempt(
            TaskPredictionAttemptId attemptId,
            int attemptNumber
    ) {
        return status == TaskPredictionStatus.PROCESSING
                && activeAttemptId != null
                && activeAttemptId.equals(attemptId)
                && attemptCount == attemptNumber;
    }

    public TaskPredictedReason predictedReason(
            TaskPredictedReasonId predictedReasonId
    ) {
        Objects.requireNonNull(predictedReasonId, "predictedReasonId");
        return predictedReasons.stream()
                .filter(reason -> reason.id().equals(predictedReasonId))
                .findFirst()
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_PREDICTED_REASON_NOT_FOUND",
                        "predictedReasonId",
                        "predicted reason does not belong to prediction"));
    }

    public boolean matches(
            TaskUserId expectedUserId,
            TaskId expectedTaskId,
            TaskPersonaGenerationId expectedPersonaGenerationId
    ) {
        return userId.equals(expectedUserId)
                && taskId.equals(expectedTaskId)
                && personaGenerationId.equals(expectedPersonaGenerationId);
    }

    public TaskPredictionId id() { return id; }
    public TaskPredictionId requestId() { return id; }
    public TaskUserId userId() { return userId; }
    public TaskId taskId() { return taskId; }
    public TaskPersonaGenerationId personaGenerationId() { return personaGenerationId; }
    public TaskPersonaId personaId() { return personaId; }
    public String candidatePolicyVersion() { return candidatePolicyVersion; }
    public TaskPredictionStatus status() { return status; }
    public int attemptCount() { return attemptCount; }
    public List<TaskPredictedReason> predictedReasons() { return predictedReasons; }
    public Instant nextRetryAt() { return nextRetryAt; }
    public TaskPredictionError lastError() { return lastError; }
    public Instant createdAt() { return createdAt; }
    public Instant startedAt() { return startedAt; }
    public Instant completedAt() { return completedAt; }
    public TaskPredictionAttemptId activeAttemptId() { return activeAttemptId; }
    public Instant processingStartedAt() { return processingStartedAt; }
    public Instant leaseExpiresAt() { return leaseExpiresAt; }

    private List<TaskPredictedReason> validatePredictedReasons(
            Task task,
            List<TaskPredictedReason> rawReasons
    ) {
        List<TaskPredictedReason> suppliedReasons =
                immutablePredictedReasons(rawReasons);
        Set<TaskPredictedReasonId> ids = new HashSet<>();
        Set<PredictedReasonContent> contents = new HashSet<>();
        Map<TaskOptionId, Set<Integer>> ordersByOption = new HashMap<>();
        Set<TaskOptionId> taskOptionIds = task.questions().getFirst()
                .options().stream()
                .map(TaskOption::id)
                .collect(java.util.stream.Collectors.toSet());

        for (TaskPredictedReason reason : suppliedReasons) {
            if (!reason.predictionId().equals(id)) {
                throw invalidPredictedReasons(
                        "TASK_PREDICTED_REASON_OWNER_MISMATCH",
                        "predicted reason does not belong to prediction");
            }
            if (!ids.add(reason.id())) {
                throw invalidPredictedReasons(
                        "TASK_PREDICTED_REASON_ID_DUPLICATED",
                        "predicted reason ID must be unique");
            }
            if (!taskOptionIds.contains(reason.optionId())) {
                throw invalidPredictedReasons(
                        "TASK_PREDICTED_REASON_OPTION_MISMATCH",
                        "predicted reason option does not belong to task");
            }
            if (!contents.add(new PredictedReasonContent(
                    reason.optionId(), reason.reason()))) {
                throw invalidPredictedReasons(
                        "TASK_PREDICTED_REASON_DUPLICATED",
                        "identical reasons are not allowed for an option");
            }
            Set<Integer> orders = ordersByOption.computeIfAbsent(
                    reason.optionId(), ignored -> new HashSet<>());
            if (!orders.add(reason.reasonOrder())) {
                throw invalidPredictedReasons(
                        "TASK_PREDICTED_REASON_ORDER_DUPLICATED",
                        "reason order must be unique within an option");
            }
        }

        validateCardinality(taskOptionIds, ordersByOption);
        return suppliedReasons.stream()
                .sorted(predictedReasonComparator(task))
                .toList();
    }

    private void validateCardinality(
            Set<TaskOptionId> expectedOptionIds,
            Map<TaskOptionId, Set<Integer>> ordersByOption
    ) {
        if (!ordersByOption.keySet().equals(expectedOptionIds)) {
            throw invalidPredictedReasons(
                    "TASK_PREDICTED_REASON_SCOPE_INCOMPLETE",
                    "predicted reasons do not cover every task option");
        }
        Set<Integer> expectedOrders = Set.of(1, 2);
        if (ordersByOption.values().stream()
                .anyMatch(orders -> !orders.equals(expectedOrders))) {
            throw invalidPredictedReasons(
                    "TASK_PREDICTED_REASON_COUNT_INVALID",
                    "each option must have exactly "
                            + TaskLimits.PREDICTED_REASONS_PER_OPTION
                            + " predicted reasons in order");
        }
    }

    private Comparator<TaskPredictedReason> predictedReasonComparator(Task task) {
        Map<TaskOptionId, Integer> optionOrders = new HashMap<>();
        for (TaskQuestion question : task.questions()) {
            for (TaskOption option : question.options()) {
                optionOrders.put(option.id(), option.displayOrder());
            }
        }
        return Comparator
                .comparingInt((TaskPredictedReason reason) ->
                        optionOrders.get(reason.optionId()))
                .thenComparingInt(TaskPredictedReason::reasonOrder);
    }

    private void validateConsistency() {
        if (startedAt != null && startedAt.isBefore(createdAt)) {
            throw inconsistent("startedAt must not be before createdAt");
        }
        if (completedAt != null && (completedAt.isBefore(createdAt)
                || (startedAt != null && completedAt.isBefore(startedAt)))) {
            throw inconsistent("completedAt is invalid");
        }
        switch (status) {
            case PENDING -> {
                if (attemptCount != 0 || startedAt != null
                        || completedAt != null || nextRetryAt != null
                        || lastError != null || !predictedReasons.isEmpty()) {
                    throw inconsistent("pending fields are inconsistent");
                }
            }
            case PROCESSING -> {
                requireStarted();
                if (completedAt != null || nextRetryAt != null
                        || !predictedReasons.isEmpty()
                        || activeAttemptId == null
                        || processingStartedAt == null
                        || leaseExpiresAt == null
                        || !leaseExpiresAt.isAfter(processingStartedAt)) {
                    throw inconsistent("processing fields are inconsistent");
                }
            }
            case RETRY_WAIT -> {
                requireStarted();
                if (completedAt != null || nextRetryAt == null
                        || lastError == null || !predictedReasons.isEmpty()) {
                    throw inconsistent("retry wait fields are inconsistent");
                }
            }
            case SUCCEEDED -> {
                requireStarted();
                if (completedAt == null || nextRetryAt != null
                        || lastError != null || predictedReasons.isEmpty()) {
                    throw inconsistent("succeeded fields are inconsistent");
                }
            }
            case FAILED -> {
                if (completedAt == null || nextRetryAt != null
                        || lastError == null || !predictedReasons.isEmpty()) {
                    throw inconsistent("failed fields are inconsistent");
                }
            }
        }
        if (status != TaskPredictionStatus.PROCESSING
                && (activeAttemptId != null || processingStartedAt != null
                || leaseExpiresAt != null)) {
            throw inconsistent(
                    "only processing prediction may own an active attempt");
        }
    }

    private void requireStarted() {
        if (attemptCount < 1 || startedAt == null) {
            throw inconsistent("started prediction requires attempt data");
        }
    }

    private void clearActiveAttempt() {
        activeAttemptId = null;
        processingStartedAt = null;
        leaseExpiresAt = null;
    }

    private void requireStatus(
            TaskPredictionStatus expected,
            String action
    ) {
        if (status != expected) {
            throw transitionNotAllowed(action);
        }
    }

    private void requireTime(Instant occurredAt) {
        Objects.requireNonNull(occurredAt, "occurredAt");
        Instant baseline = completedAt != null
                ? completedAt
                : startedAt != null ? startedAt : createdAt;
        if (occurredAt.isBefore(baseline)) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_TIME_NOT_MONOTONIC",
                    "occurredAt",
                    "prediction event time must be monotonic");
        }
    }

    private static List<TaskPredictedReason> immutablePredictedReasons(
            List<TaskPredictedReason> predictedReasons
    ) {
        Objects.requireNonNull(predictedReasons, "predictedReasons");
        if (predictedReasons.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "predictedReasons must not contain null");
        }
        return List.copyOf(predictedReasons);
    }

    private TaskDomainException transitionNotAllowed(String action) {
        return TaskDomainException.invariant(
                "TASK_PREDICTION_TRANSITION_NOT_ALLOWED",
                "status",
                action + " is not allowed from " + status);
    }

    private static TaskDomainException invalidPredictedReasons(
            String code,
            String message
    ) {
        return TaskDomainException.invariant(
                code, "predictedReasons", message);
    }

    private static TaskDomainException inconsistent(String message) {
        return TaskDomainException.invariant(
                "TASK_PREDICTION_STATE_INCONSISTENT", "status", message);
    }

    private record PredictedReasonContent(
            TaskOptionId optionId,
            String reason
    ) {
    }
}
