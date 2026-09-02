package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationPayloadFactory;
import com.hamcheeze.vote.task.application.port.out.TaskPreparationRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class TaskPreparationStateService {

    private static final int MAX_ERROR_DETAIL_LENGTH = 1000;

    private final TaskRepository tasks;
    private final TaskPreparationRepository preparations;
    private final TaskPreparationPayloadFactory payloads;
    private final TaskPreparationPolicy policy;
    private final Clock clock;

    @Autowired
    public TaskPreparationStateService(
            TaskRepository tasks,
            TaskPreparationRepository preparations,
            TaskPreparationPayloadFactory payloads,
            TaskPreparationPolicy policy
    ) {
        this(tasks, preparations, payloads, policy, Clock.systemUTC());
    }

    TaskPreparationStateService(
            TaskRepository tasks,
            TaskPreparationRepository preparations,
            TaskPreparationPayloadFactory payloads,
            TaskPreparationPolicy policy,
            Clock clock
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.preparations = Objects.requireNonNull(
                preparations, "preparations");
        this.payloads = Objects.requireNonNull(payloads, "payloads");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public TaskPreparationClaim claim(TaskId taskId) {
        Instant now = clock.instant();
        Task task = lockTask(taskId);
        return claim(task, now);
    }

    @Transactional
    public TaskPreparationRecord markReady(
            TaskPreparationCommand command,
            TaskPreparationProviderResult result
    ) {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(result, "result");
        validateResult(command, result);
        TaskPreparationRecord existing = lockPreparation(command.taskId());
        requireCurrentAttempt(existing, command);
        Instant now = clock.instant();
        return preparations.save(new TaskPreparationRecord(
                existing.taskId(),
                existing.requestId(),
                existing.contentFingerprint(),
                existing.requestPayload(),
                TaskPreparationStatus.READY,
                existing.attemptCount(),
                null,
                null,
                result.preparedAt(),
                null,
                null,
                existing.createdAt(),
                now));
    }

    @Transactional
    public TaskPreparationRecord markFailed(
            TaskPreparationCommand command,
            TaskPreparationProviderException exception
    ) {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(exception, "exception");
        TaskPreparationRecord existing = lockPreparation(command.taskId());
        requireCurrentAttempt(existing, command);
        Instant now = clock.instant();
        TaskPreparationStatus status = exception.retryable()
                ? TaskPreparationStatus.FAILED
                : TaskPreparationStatus.REJECTED;
        return preparations.save(new TaskPreparationRecord(
                existing.taskId(),
                existing.requestId(),
                existing.contentFingerprint(),
                existing.requestPayload(),
                status,
                existing.attemptCount(),
                null,
                exception.retryable() ? now.plus(policy.retryDelay()) : null,
                null,
                exception.code(),
                errorDetail(exception),
                existing.createdAt(),
                now));
    }

    private TaskPreparationClaim claim(
            Task task,
            Instant now
    ) {
        String fingerprint = payloads.fingerprint(task);
        Optional<TaskPreparationRecord> stored =
                preparations.findByTaskIdForUpdate(task.id());
        if (stored.isPresent()
                && stored.get().readyFor(fingerprint)) {
            return TaskPreparationClaim.ready(stored.get());
        }
        if (stored.isPresent()
                && stored.get().contentFingerprint().equals(fingerprint)
                && stored.get().status()
                == TaskPreparationStatus.REJECTED) {
            throw invariant(
                    "TASK_PREPARATION_REJECTED",
                    "Runtime rejected the current Task content");
        }
        if (stored.isPresent()
                && stored.get().status()
                == TaskPreparationStatus.PROCESSING
                && !leaseExpired(stored.get(), now)) {
            throw invariant(
                    "TASK_PREPARATION_IN_PROGRESS",
                    "Task preparation is already in progress");
        }
        boolean sameContent = stored.isPresent()
                && stored.get().contentFingerprint().equals(fingerprint);
        UUID requestId = sameContent
                ? stored.get().requestId() : UUID.randomUUID();
        TaskPreparationCommand command = payloads.create(task, requestId);
        if (!fingerprint.equals(command.contentFingerprint())) {
            throw new IllegalStateException(
                    "Task preparation fingerprint changed during serialization");
        }
        int attemptCount = sameContent
                ? stored.get().attemptCount() + 1 : 1;
        Instant createdAt = sameContent
                ? stored.get().createdAt() : now;
        preparations.save(new TaskPreparationRecord(
                task.id(),
                requestId,
                fingerprint,
                command.requestPayload(),
                TaskPreparationStatus.PROCESSING,
                attemptCount,
                now,
                null,
                null,
                null,
                null,
                createdAt,
                now));
        return TaskPreparationClaim.execute(command);
    }

    private boolean leaseExpired(
            TaskPreparationRecord preparation,
            Instant now
    ) {
        return !preparation.processingStartedAt()
                .plus(policy.processingLeaseDuration())
                .isAfter(now);
    }

    private Task lockTask(TaskId taskId) {
        return tasks.findByIdForUpdate(Objects.requireNonNull(
                        taskId, "taskId"))
                .orElseThrow(() -> invariant(
                        "TASK_NOT_FOUND", "Task does not exist"));
    }

    private TaskPreparationRecord lockPreparation(TaskId taskId) {
        return preparations.findByTaskIdForUpdate(taskId)
                .orElseThrow(() -> new IllegalStateException(
                        "Task preparation disappeared during provider call"));
    }

    private static void requireCurrentAttempt(
            TaskPreparationRecord preparation,
            TaskPreparationCommand command
    ) {
        if (preparation.status() != TaskPreparationStatus.PROCESSING
                || !preparation.requestId().equals(command.requestId())
                || !preparation.contentFingerprint().equals(
                        command.contentFingerprint())) {
            throw new IllegalStateException(
                    "Task preparation attempt is no longer current");
        }
    }

    private static void validateResult(
            TaskPreparationCommand command,
            TaskPreparationProviderResult result
    ) {
        if (result.schemaVersion() != command.schemaVersion()
                || !result.requestId().equals(command.requestId())
                || !result.taskId().equals(command.taskId())
                || !result.contentFingerprint().equals(
                        command.contentFingerprint())) {
            throw new TaskPreparationProviderException(
                    false,
                    null,
                    "TASK_PREPARATION_RESPONSE_MISMATCH",
                    "Runtime preparation response does not match request",
                    null);
        }
    }

    private static String errorDetail(
            TaskPreparationProviderException exception
    ) {
        String value = exception.getMessage() == null
                ? exception.code() : exception.getMessage().strip();
        return value.length() <= MAX_ERROR_DETAIL_LENGTH
                ? value : value.substring(0, MAX_ERROR_DETAIL_LENGTH);
    }

    private static TaskDomainException invariant(
            String code,
            String message
    ) {
        return TaskDomainException.invariant(
                code, "taskPreparation", message);
    }
}
