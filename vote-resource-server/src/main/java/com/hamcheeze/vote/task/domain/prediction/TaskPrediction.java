package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskText;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

import java.time.Instant;
import java.util.ArrayList;
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
    private final TaskPersonaVersionId personaVersionId;
    private final TaskPersonaId personaId;
    private final String candidatePolicyVersion;
    private final int requestedCandidateCount;
    private TaskPredictionStatus status;
    private int attemptCount;
    private List<TaskPredictionCandidate> candidates;
    private Instant nextRetryAt;
    private TaskPredictionError lastError;
    private final Instant createdAt;
    private Instant startedAt;
    private Instant completedAt;

    private TaskPrediction(
            TaskPredictionId id,
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskPersonaId personaId,
            String candidatePolicyVersion,
            int requestedCandidateCount,
            TaskPredictionStatus status,
            int attemptCount,
            List<TaskPredictionCandidate> candidates,
            Instant nextRetryAt,
            TaskPredictionError lastError,
            Instant createdAt,
            Instant startedAt,
            Instant completedAt
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.userId = Objects.requireNonNull(userId, "userId");
        this.taskId = Objects.requireNonNull(taskId, "taskId");
        this.personaGenerationId = Objects.requireNonNull(
                personaGenerationId, "personaGenerationId");
        this.personaVersionId = Objects.requireNonNull(
                personaVersionId, "personaVersionId");
        this.personaId = Objects.requireNonNull(personaId, "personaId");
        this.candidatePolicyVersion = TaskText.required(
                candidatePolicyVersion,
                100,
                "TASK_PREDICTION_CANDIDATE_POLICY_VERSION",
                "candidatePolicyVersion");
        if (requestedCandidateCount < 1) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_CANDIDATE_COUNT_INVALID",
                    "requestedCandidateCount",
                    "requestedCandidateCount must be positive");
        }
        this.requestedCandidateCount = requestedCandidateCount;
        this.status = Objects.requireNonNull(status, "status");
        if (attemptCount < 0) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_ATTEMPT_COUNT_INVALID",
                    "attemptCount",
                    "attemptCount must not be negative");
        }
        this.attemptCount = attemptCount;
        this.candidates = immutableCandidates(candidates);
        this.nextRetryAt = nextRetryAt;
        this.lastError = lastError;
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.startedAt = startedAt;
        this.completedAt = completedAt;
        validateConsistency();
    }

    public static TaskPrediction pending(
            TaskPredictionId id,
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskPersonaId personaId,
            String candidatePolicyVersion,
            int requestedCandidateCount,
            Instant createdAt
    ) {
        return new TaskPrediction(
                id, userId, taskId, personaGenerationId, personaVersionId,
                personaId,
                candidatePolicyVersion, requestedCandidateCount,
                TaskPredictionStatus.PENDING, 0, List.of(), null, null,
                createdAt, null, null);
    }

    public static TaskPrediction restore(
            TaskPredictionId id,
            TaskUserId userId,
            Task task,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskPersonaId personaId,
            String candidatePolicyVersion,
            int requestedCandidateCount,
            TaskPredictionStatus status,
            int attemptCount,
            List<TaskPredictionCandidate> candidates,
            Instant nextRetryAt,
            TaskPredictionError lastError,
            Instant createdAt,
            Instant startedAt,
            Instant completedAt
    ) {
        Objects.requireNonNull(task, "task");
        TaskPrediction restored = new TaskPrediction(
                id, userId, task.id(), personaGenerationId, personaVersionId,
                personaId,
                candidatePolicyVersion, requestedCandidateCount, status,
                attemptCount, candidates, nextRetryAt, lastError,
                createdAt, startedAt, completedAt);
        if (status == TaskPredictionStatus.SUCCEEDED) {
            restored.candidates = restored.validateCandidates(task, candidates);
        }
        return restored;
    }

    public int startProcessing(
            TaskPredictionRetryPolicy retryPolicy,
            Instant occurredAt
    ) {
        Objects.requireNonNull(retryPolicy, "retryPolicy");
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
        return attemptCount;
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
            return;
        }
        status = TaskPredictionStatus.FAILED;
        nextRetryAt = null;
        completedAt = occurredAt;
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
    }

    public void succeed(
            Task task,
            List<TaskPredictionCandidate> successfulCandidates,
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
        List<TaskPredictionCandidate> validated =
                validateCandidates(task, successfulCandidates);
        candidates = validated;
        status = TaskPredictionStatus.SUCCEEDED;
        nextRetryAt = null;
        lastError = null;
        completedAt = occurredAt;
    }

    public TaskPredictionCandidate candidate(
            TaskPredictionCandidateId candidateId
    ) {
        Objects.requireNonNull(candidateId, "candidateId");
        return candidates.stream()
                .filter(candidate -> candidate.id().equals(candidateId))
                .findFirst()
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_PREDICTION_CANDIDATE_NOT_FOUND",
                        "candidateId",
                        "candidate does not belong to prediction"));
    }

    public boolean matches(
            TaskUserId expectedUserId,
            TaskId expectedTaskId,
            TaskPersonaGenerationId expectedPersonaGenerationId,
            TaskPersonaVersionId expectedPersonaVersionId
    ) {
        return userId.equals(expectedUserId)
                && taskId.equals(expectedTaskId)
                && personaGenerationId.equals(expectedPersonaGenerationId)
                && personaVersionId.equals(expectedPersonaVersionId);
    }

    public TaskPredictionId id() { return id; }
    public TaskPredictionId requestId() { return id; }
    public TaskUserId userId() { return userId; }
    public TaskId taskId() { return taskId; }
    public TaskPersonaGenerationId personaGenerationId() { return personaGenerationId; }
    public TaskPersonaVersionId personaVersionId() { return personaVersionId; }
    public TaskPersonaId personaId() { return personaId; }
    public String candidatePolicyVersion() { return candidatePolicyVersion; }
    public int requestedCandidateCount() { return requestedCandidateCount; }
    public TaskPredictionStatus status() { return status; }
    public int attemptCount() { return attemptCount; }
    public List<TaskPredictionCandidate> candidates() { return candidates; }
    public Instant nextRetryAt() { return nextRetryAt; }
    public TaskPredictionError lastError() { return lastError; }
    public Instant createdAt() { return createdAt; }
    public Instant startedAt() { return startedAt; }
    public Instant completedAt() { return completedAt; }

    private List<TaskPredictionCandidate> validateCandidates(
            Task task,
            List<TaskPredictionCandidate> rawCandidates
    ) {
        List<TaskPredictionCandidate> suppliedCandidates =
                immutableCandidates(rawCandidates);
        List<TaskPredictionCandidate> normalized =
                new ArrayList<>(suppliedCandidates.size());
        Set<TaskPredictionCandidateId> ids = new HashSet<>();
        Set<CandidateContent> contents = new HashSet<>();
        Map<CandidateSlot, Set<Integer>> ordersBySlot = new HashMap<>();

        for (TaskPredictionCandidate candidate : suppliedCandidates) {
            if (!candidate.predictionId().equals(id)) {
                throw invalidCandidates(
                        "TASK_PREDICTION_CANDIDATE_OWNER_MISMATCH",
                        "candidate does not belong to prediction");
            }
            if (!ids.add(candidate.id())) {
                throw invalidCandidates(
                        "TASK_PREDICTION_CANDIDATE_ID_DUPLICATED",
                        "candidate ID must be unique");
            }
            TaskQuestion question = task.question(candidate.questionId());
            TaskAnswerValue answer = question.validateAndNormalize(
                    candidate.answerValue());
            TaskPredictionCandidate valid = candidate.normalized(answer);
            if (!contents.add(new CandidateContent(
                    valid.questionId(), valid.answerValue(), valid.rationale()))) {
                throw invalidCandidates(
                        "TASK_PREDICTION_CANDIDATE_DUPLICATED",
                        "identical answer and rationale are not allowed");
            }
            CandidateSlot slot = slot(question, answer);
            Set<Integer> orders = ordersBySlot.computeIfAbsent(
                    slot, ignored -> new HashSet<>());
            if (!orders.add(candidate.candidateOrder())) {
                throw invalidCandidates(
                        "TASK_PREDICTION_CANDIDATE_ORDER_DUPLICATED",
                        "candidate order must be unique within its slot");
            }
            normalized.add(valid);
        }

        validateCardinality(task, ordersBySlot);
        return normalized.stream()
                .sorted(candidateComparator(task))
                .toList();
    }

    private void validateCardinality(
            Task task,
            Map<CandidateSlot, Set<Integer>> ordersBySlot
    ) {
        Set<CandidateSlot> expectedSlots = new HashSet<>();
        for (TaskQuestion question : task.questions()) {
            if (question.type() == TaskQuestionType.SINGLE_CHOICE) {
                for (TaskOption option : question.options()) {
                    expectedSlots.add(new CandidateSlot(
                            question.id(), option.id()));
                }
            } else {
                expectedSlots.add(new CandidateSlot(question.id(), null));
            }
        }
        if (!ordersBySlot.keySet().equals(expectedSlots)) {
            throw invalidCandidates(
                    "TASK_PREDICTION_CANDIDATE_SCOPE_INCOMPLETE",
                    "candidate slots do not cover the entire task");
        }
        Set<Integer> expectedOrders = new HashSet<>();
        for (int order = 1; order <= requestedCandidateCount; order++) {
            expectedOrders.add(order);
        }
        if (ordersBySlot.values().stream()
                .anyMatch(orders -> !orders.equals(expectedOrders))) {
            throw invalidCandidates(
                    "TASK_PREDICTION_CANDIDATE_COUNT_INVALID",
                    "candidate count or order does not match policy snapshot");
        }
    }

    private CandidateSlot slot(
            TaskQuestion question,
            TaskAnswerValue answer
    ) {
        if (question.type() != TaskQuestionType.SINGLE_CHOICE) {
            return new CandidateSlot(question.id(), null);
        }
        TaskOptionId optionId = ((SingleChoiceValue) answer)
                .selection()
                .optionId();
        return new CandidateSlot(question.id(), optionId);
    }

    private Comparator<TaskPredictionCandidate> candidateComparator(Task task) {
        Map<TaskQuestionId, Integer> questionOrders = new HashMap<>();
        Map<TaskOptionId, Integer> optionOrders = new HashMap<>();
        for (TaskQuestion question : task.questions()) {
            questionOrders.put(question.id(), question.displayOrder());
            for (TaskOption option : question.options()) {
                optionOrders.put(option.id(), option.displayOrder());
            }
        }
        return Comparator
                .comparingInt((TaskPredictionCandidate candidate) ->
                        questionOrders.get(candidate.questionId()))
                .thenComparingInt(candidate -> {
                    if (candidate.answerValue()
                            instanceof SingleChoiceValue single) {
                        return optionOrders.get(single.selection().optionId());
                    }
                    return 0;
                })
                .thenComparingInt(
                        TaskPredictionCandidate::candidateOrder);
    }

    private void validateConsistency() {
        if (startedAt != null && startedAt.isBefore(createdAt)) {
            throw inconsistent("startedAt must not be before createdAt");
        }
        if (completedAt != null && (completedAt.isBefore(createdAt)
                || startedAt == null || completedAt.isBefore(startedAt))) {
            throw inconsistent("completedAt is invalid");
        }
        switch (status) {
            case PENDING -> {
                if (attemptCount != 0 || startedAt != null
                        || completedAt != null || nextRetryAt != null
                        || lastError != null || !candidates.isEmpty()) {
                    throw inconsistent("pending fields are inconsistent");
                }
            }
            case PROCESSING -> {
                requireStarted();
                if (completedAt != null || nextRetryAt != null
                        || !candidates.isEmpty()) {
                    throw inconsistent("processing fields are inconsistent");
                }
            }
            case RETRY_WAIT -> {
                requireStarted();
                if (completedAt != null || nextRetryAt == null
                        || lastError == null || !candidates.isEmpty()) {
                    throw inconsistent("retry wait fields are inconsistent");
                }
            }
            case SUCCEEDED -> {
                requireStarted();
                if (completedAt == null || nextRetryAt != null
                        || lastError != null || candidates.isEmpty()) {
                    throw inconsistent("succeeded fields are inconsistent");
                }
            }
            case FAILED -> {
                requireStarted();
                if (completedAt == null || nextRetryAt != null
                        || lastError == null || !candidates.isEmpty()) {
                    throw inconsistent("failed fields are inconsistent");
                }
            }
        }
    }

    private void requireStarted() {
        if (attemptCount < 1 || startedAt == null) {
            throw inconsistent("started prediction requires attempt data");
        }
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

    private static List<TaskPredictionCandidate> immutableCandidates(
            List<TaskPredictionCandidate> candidates
    ) {
        Objects.requireNonNull(candidates, "candidates");
        if (candidates.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "candidates must not contain null");
        }
        return List.copyOf(candidates);
    }

    private TaskDomainException transitionNotAllowed(String action) {
        return TaskDomainException.invariant(
                "TASK_PREDICTION_TRANSITION_NOT_ALLOWED",
                "status",
                action + " is not allowed from " + status);
    }

    private static TaskDomainException invalidCandidates(
            String code,
            String message
    ) {
        return TaskDomainException.invariant(code, "candidates", message);
    }

    private static TaskDomainException inconsistent(String message) {
        return TaskDomainException.invariant(
                "TASK_PREDICTION_STATE_INCONSISTENT", "status", message);
    }

    private record CandidateSlot(
            TaskQuestionId questionId,
            TaskOptionId optionId
    ) {
    }

    private record CandidateContent(
            TaskQuestionId questionId,
            TaskAnswerValue answerValue,
            String rationale
    ) {
    }
}
