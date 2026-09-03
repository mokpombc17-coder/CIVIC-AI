package com.hamcheeze.vote.task.application.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationPayloadFactory;
import com.hamcheeze.vote.task.application.port.out.TaskPreparationRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
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
        if (task.status() != TaskStatus.DRAFT) {
            throw invariant(
                    "TASK_PREPARATION_TASK_NOT_DRAFT",
                    "Only a draft Task can be prepared");
        }
        task.validatePublishable();
        return claim(task, now);
    }

    @Transactional
    public void requireContentEditable(Task task) {
        Objects.requireNonNull(task, "task");
        String fingerprint = payloads.fingerprint(task);
        preparations.findByTaskIdForUpdate(task.id())
                .filter(preparation -> preparation.contentFingerprint()
                        .equals(fingerprint))
                .filter(preparation -> preparation.status()
                        == TaskPreparationStatus.PROCESSING
                        || preparation.status()
                        == TaskPreparationStatus.READY)
                .ifPresent(preparation -> {
                    throw invariant(
                            "TASK_CONTENT_LOCKED_BY_PREPARATION",
                            "Task content is locked by its preparation");
                });
    }

    @Transactional(readOnly = true)
    public TaskPreparationVerification verification(TaskId taskId) {
        Task task = tasks.findById(Objects.requireNonNull(taskId, "taskId"))
                .orElseThrow(() -> invariant(
                        "TASK_NOT_FOUND", "Task does not exist"));
        TaskPreparationRecord preparation = preparations
                .findByTaskId(taskId)
                .orElseThrow(() -> invariant(
                        "TASK_PREPARATION_NOT_READY",
                        "Task preparation is not ready"));
        String fingerprint = payloads.fingerprint(task);
        if (!preparation.contentFingerprint().equals(fingerprint)) {
            throw invariant(
                    "TASK_PREPARATION_FINGERPRINT_MISMATCH",
                    "Task preparation does not match current content");
        }
        return new TaskPreparationVerification(
                1,
                preparation.requestId(),
                task.id(),
                fingerprint);
    }

    @Transactional(readOnly = true)
    public void requireLocallyReady(TaskId taskId) {
        TaskPreparationVerification verification = verification(taskId);
        TaskPreparationRecord preparation = preparations
                .findByTaskId(taskId)
                .orElseThrow(() -> invariant(
                        "TASK_PREPARATION_NOT_READY",
                        "Task preparation is not ready"));
        if (!preparation.readyFor(verification.contentFingerprint())) {
            throw invariant(
                    "TASK_PREPARATION_NOT_READY",
                    "Task preparation is not ready");
        }
    }

    @Transactional
    public void deferPublicationVerification(TaskId taskId) {
        Task task = tasks.findByIdForUpdate(Objects.requireNonNull(
                        taskId, "taskId"))
                .orElse(null);
        if (task == null) {
            return;
        }
        TaskPreparationRecord existing = preparations
                .findByTaskIdForUpdate(taskId)
                .orElse(null);
        if (existing == null
                || !existing.readyFor(payloads.fingerprint(task))) {
            return;
        }
        Instant now = clock.instant();
        preparations.save(copyWithPublicationRetry(
                existing, now.plus(policy.retryDelay()), now));
    }

    @Transactional
    public TaskPreparationRecord applyProviderResult(
            TaskPreparationCommand command,
            TaskPreparationProviderResult result
    ) {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(result, "result");
        validateResult(command, result);
        if (result.status() == TaskPreparationStatus.READY) {
            return markReady(command, result);
        }
        TaskPreparationRecord existing = lockPreparation(command.taskId());
        requireSameAttempt(existing, command);
        return existing;
    }

    @Transactional
    public TaskPreparationRecord applyCallback(
            TaskPreparationResult result
    ) {
        Objects.requireNonNull(result, "result");
        TaskId taskId = preparations.findByRequestId(result.requestId())
                .map(TaskPreparationRecord::taskId)
                .orElse(result.taskId());
        Task task = tasks.findByIdForUpdate(taskId)
                .orElseThrow(() -> invariant(
                        "TASK_PREPARATION_NOT_FOUND",
                        "Task preparation does not exist"));
        TaskPreparationRecord existing = preparations
                .findByTaskIdForUpdate(taskId)
                .orElseThrow(() -> invariant(
                        "TASK_PREPARATION_NOT_FOUND",
                        "Task preparation does not exist"));

        if (!existing.requestId().equals(result.requestId())) {
            throw invariant(
                    "TASK_PREPARATION_STALE_RESULT",
                    "Task preparation result is no longer current");
        }
        if (!existing.taskId().equals(result.taskId())
                || !existing.contentFingerprint().equals(
                        result.contentFingerprint())) {
            throw invariant(
                    "TASK_PREPARATION_RESULT_MISMATCH",
                    "Task preparation result does not match its request");
        }
        if (!payloads.fingerprint(task).equals(
                existing.contentFingerprint())) {
            throw invariant(
                    "TASK_PREPARATION_STALE_RESULT",
                    "Task content changed after preparation started");
        }
        if (sameTerminalResult(existing, result)) {
            return existing;
        }
        if (existing.status() != TaskPreparationStatus.PROCESSING
                && !(existing.status() == TaskPreparationStatus.FAILED
                && result.status() == TaskPreparationStatus.READY)) {
            throw invariant(
                    "TASK_PREPARATION_TERMINAL_STATE_CONFLICT",
                    "Task preparation already has a different terminal result");
        }
        return saveCallbackResult(existing, result, clock.instant());
    }

    @Transactional
    public TaskPreparationRecord applyVerification(
            TaskPreparationVerification verification,
            TaskPreparationRemoteStatus remote
    ) {
        Objects.requireNonNull(verification, "verification");
        Objects.requireNonNull(remote, "remote");
        if (remote.schemaVersion() != verification.schemaVersion()
                || !remote.requestId().equals(verification.requestId())
                || !remote.taskId().equals(verification.taskId())
                || !remote.contentFingerprint().equals(
                        verification.contentFingerprint())) {
            throw invariant(
                    "TASK_PREPARATION_FINGERPRINT_MISMATCH",
                    "Runtime status does not match current preparation");
        }

        Task task = tasks.findByIdForUpdate(verification.taskId())
                .orElseThrow(() -> invariant(
                        "TASK_NOT_FOUND", "Task does not exist"));
        TaskPreparationRecord existing = preparations
                .findByTaskIdForUpdate(verification.taskId())
                .orElseThrow(() -> invariant(
                        "TASK_PREPARATION_NOT_READY",
                        "Task preparation is not ready"));
        if (!existing.requestId().equals(verification.requestId())
                || !existing.contentFingerprint().equals(
                        verification.contentFingerprint())
                || !payloads.fingerprint(task).equals(
                        verification.contentFingerprint())) {
            throw invariant(
                    "TASK_PREPARATION_FINGERPRINT_MISMATCH",
                    "Task preparation changed during verification");
        }
        if (remote.status() == TaskPreparationStatus.PROCESSING) {
            return existing;
        }
        if (existing.status() == TaskPreparationStatus.READY
                && remote.status() == TaskPreparationStatus.READY) {
            if (existing.publicationVerificationNextRetryAt() == null) {
                return existing;
            }
            return preparations.save(copyWithPublicationRetry(
                    existing, null, clock.instant()));
        }
        TaskPreparationResult result = remote.terminalResult();
        if (sameTerminalResult(existing, result)) {
            return existing;
        }
        if (existing.status() != TaskPreparationStatus.PROCESSING
                && !(existing.status() == TaskPreparationStatus.FAILED
                && result.status() == TaskPreparationStatus.READY)) {
            throw invariant(
                    "TASK_PREPARATION_TERMINAL_STATE_CONFLICT",
                    "Runtime status conflicts with local terminal result");
        }
        return saveCallbackResult(existing, result, clock.instant());
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
        requireSameAttempt(existing, command);
        if (existing.status() == TaskPreparationStatus.READY) {
            if (Objects.equals(existing.preparedAt(), result.preparedAt())) {
                return existing;
            }
            throw new IllegalStateException(
                    "Task preparation already has another READY result");
        }
        if (existing.status() != TaskPreparationStatus.PROCESSING
                && existing.status() != TaskPreparationStatus.FAILED) {
            throw new IllegalStateException(
                    "Task preparation attempt is already terminal");
        }
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
        requireSameAttempt(existing, command);
        if (existing.status() != TaskPreparationStatus.PROCESSING) {
            return existing;
        }
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
            return TaskPreparationClaim.existing(stored.get());
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
                && stored.get().contentFingerprint().equals(fingerprint)
                && stored.get().status()
                == TaskPreparationStatus.PROCESSING
                && !leaseExpired(stored.get(), now)) {
            return TaskPreparationClaim.existing(stored.get());
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

    private TaskPreparationRecord saveCallbackResult(
            TaskPreparationRecord existing,
            TaskPreparationResult result,
            Instant now
    ) {
        TaskPreparationResult.Error error = result.error();
        return preparations.save(new TaskPreparationRecord(
                existing.taskId(),
                existing.requestId(),
                existing.contentFingerprint(),
                existing.requestPayload(),
                result.status(),
                existing.attemptCount(),
                null,
                result.status() == TaskPreparationStatus.FAILED
                        ? now.plus(policy.retryDelay()) : null,
                null,
                result.preparedAt(),
                error == null ? null : error.code(),
                error == null ? null : error.detail(),
                existing.createdAt(),
                now));
    }

    private static TaskPreparationRecord copyWithPublicationRetry(
            TaskPreparationRecord existing,
            Instant retryAt,
            Instant updatedAt
    ) {
        return new TaskPreparationRecord(
                existing.taskId(),
                existing.requestId(),
                existing.contentFingerprint(),
                existing.requestPayload(),
                existing.status(),
                existing.attemptCount(),
                existing.processingStartedAt(),
                existing.nextRetryAt(),
                retryAt,
                existing.preparedAt(),
                existing.lastErrorCode(),
                existing.lastErrorDetail(),
                existing.createdAt(),
                updatedAt);
    }

    private static boolean sameTerminalResult(
            TaskPreparationRecord existing,
            TaskPreparationResult result
    ) {
        if (existing.status() != result.status()) {
            return false;
        }
        if (result.status() == TaskPreparationStatus.READY) {
            return Objects.equals(
                    existing.preparedAt(), result.preparedAt());
        }
        TaskPreparationResult.Error error = result.error();
        return Objects.equals(existing.lastErrorCode(), error.code())
                && Objects.equals(existing.lastErrorDetail(), error.detail());
    }

    private static void requireSameAttempt(
            TaskPreparationRecord preparation,
            TaskPreparationCommand command
    ) {
        if (!preparation.requestId().equals(command.requestId())
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
