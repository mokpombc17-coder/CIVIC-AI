package com.hamcheeze.vote.task.domain.opinionmap;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public final class OpinionMapGeneration {

    private final OpinionMapGenerationId id;
    private final TaskId taskId;
    private final int resultVersion;
    private final String sourceBodySha256;
    private final String promptVersion;
    private OpinionMapGenerationStatus status;
    private int attemptCount;
    private Instant nextAttemptAt;
    private String outputJson;
    private String lastErrorCode;
    private final Instant createdAt;
    private Instant processingStartedAt;
    private Instant completedAt;
    private UUID activeClaimId;
    private Instant leaseExpiresAt;
    private Instant updatedAt;

    private OpinionMapGeneration(
            OpinionMapGenerationId id,
            TaskId taskId,
            int resultVersion,
            String sourceBodySha256,
            String promptVersion,
            OpinionMapGenerationStatus status,
            int attemptCount,
            Instant nextAttemptAt,
            String outputJson,
            String lastErrorCode,
            Instant createdAt,
            Instant processingStartedAt,
            Instant completedAt,
            UUID activeClaimId,
            Instant leaseExpiresAt,
            Instant updatedAt
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.taskId = Objects.requireNonNull(taskId, "taskId");
        if (resultVersion < 1) {
            throw new IllegalArgumentException(
                    "resultVersion must be positive");
        }
        this.resultVersion = resultVersion;
        this.sourceBodySha256 = requireSha256(sourceBodySha256);
        this.promptVersion = requireText(promptVersion, "promptVersion");
        this.status = Objects.requireNonNull(status, "status");
        if (attemptCount < 0) {
            throw new IllegalArgumentException(
                    "attemptCount must not be negative");
        }
        this.attemptCount = attemptCount;
        this.nextAttemptAt = nextAttemptAt;
        this.outputJson = outputJson;
        this.lastErrorCode = lastErrorCode;
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.processingStartedAt = processingStartedAt;
        this.completedAt = completedAt;
        this.activeClaimId = activeClaimId;
        this.leaseExpiresAt = leaseExpiresAt;
        this.updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        validateConsistency();
    }

    public static OpinionMapGeneration pending(
            OpinionMapGenerationId id,
            TaskId taskId,
            int resultVersion,
            String sourceBodySha256,
            String promptVersion,
            Instant createdAt
    ) {
        return new OpinionMapGeneration(
                id, taskId, resultVersion, sourceBodySha256, promptVersion,
                OpinionMapGenerationStatus.PENDING, 0, null, null, null,
                createdAt, null, null, null, null, createdAt);
    }

    public static OpinionMapGeneration restore(
            OpinionMapGenerationId id,
            TaskId taskId,
            int resultVersion,
            String sourceBodySha256,
            String promptVersion,
            OpinionMapGenerationStatus status,
            int attemptCount,
            Instant nextAttemptAt,
            String outputJson,
            String lastErrorCode,
            Instant createdAt,
            Instant processingStartedAt,
            Instant completedAt,
            UUID activeClaimId,
            Instant leaseExpiresAt,
            Instant updatedAt
    ) {
        return new OpinionMapGeneration(
                id, taskId, resultVersion, sourceBodySha256, promptVersion,
                status, attemptCount, nextAttemptAt, outputJson,
                lastErrorCode, createdAt, processingStartedAt, completedAt,
                activeClaimId, leaseExpiresAt, updatedAt);
    }

    public boolean claim(
            UUID claimId,
            Instant now,
            Duration leaseDuration,
            int maximumAttempts
    ) {
        Objects.requireNonNull(claimId, "claimId");
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(leaseDuration, "leaseDuration");
        if (leaseDuration.isZero() || leaseDuration.isNegative()) {
            throw new IllegalArgumentException(
                    "leaseDuration must be positive");
        }
        if (maximumAttempts < 1) {
            throw new IllegalArgumentException(
                    "maximumAttempts must be positive");
        }
        if (!isDispatchableAt(now)) {
            return false;
        }
        if (attemptCount >= maximumAttempts) {
            makeUnavailable("OPINION_MAP_ATTEMPTS_EXHAUSTED", now);
            return false;
        }
        status = OpinionMapGenerationStatus.PROCESSING;
        attemptCount++;
        nextAttemptAt = null;
        outputJson = null;
        lastErrorCode = null;
        processingStartedAt = now;
        completedAt = null;
        activeClaimId = claimId;
        leaseExpiresAt = now.plus(leaseDuration);
        updatedAt = now;
        validateConsistency();
        return true;
    }

    public boolean succeed(UUID claimId, String resultJson, Instant now) {
        if (!ownsClaim(claimId)) {
            return false;
        }
        String normalizedResult = requireText(resultJson, "outputJson");
        Objects.requireNonNull(now, "now");
        outputJson = normalizedResult;
        status = OpinionMapGenerationStatus.AVAILABLE;
        lastErrorCode = null;
        nextAttemptAt = null;
        completedAt = now;
        activeClaimId = null;
        leaseExpiresAt = null;
        updatedAt = now;
        validateConsistency();
        return true;
    }

    public void replaceAvailableOutput(String resultJson, Instant now) {
        if (status != OpinionMapGenerationStatus.AVAILABLE) {
            throw new IllegalStateException(
                    "only an available Opinion Map can be replaced");
        }
        outputJson = requireText(resultJson, "outputJson");
        completedAt = Objects.requireNonNull(now, "now");
        updatedAt = now;
        validateConsistency();
    }

    public boolean fail(
            UUID claimId,
            String errorCode,
            boolean retryable,
            int maximumAttempts,
            Duration retryDelay,
            Instant now
    ) {
        if (!ownsClaim(claimId)) {
            return false;
        }
        String normalizedErrorCode = requireText(errorCode, "errorCode");
        Objects.requireNonNull(retryDelay, "retryDelay");
        Objects.requireNonNull(now, "now");
        if (maximumAttempts < 1) {
            throw new IllegalArgumentException(
                    "maximumAttempts must be positive");
        }
        if (retryDelay.isZero() || retryDelay.isNegative()) {
            throw new IllegalArgumentException(
                    "retryDelay must be positive");
        }
        lastErrorCode = normalizedErrorCode;
        if (retryable && attemptCount < maximumAttempts) {
            status = OpinionMapGenerationStatus.RETRY_WAIT;
            nextAttemptAt = now.plus(retryDelay);
            completedAt = null;
        } else {
            status = OpinionMapGenerationStatus.UNAVAILABLE;
            nextAttemptAt = null;
            completedAt = now;
        }
        outputJson = null;
        activeClaimId = null;
        leaseExpiresAt = null;
        updatedAt = now;
        validateConsistency();
        return true;
    }

    public void scheduleManualRetry(Instant now) {
        Objects.requireNonNull(now, "now");
        if (status != OpinionMapGenerationStatus.UNAVAILABLE) {
            throw new IllegalStateException(
                    "only unavailable Opinion Map generation can be retried");
        }
        status = OpinionMapGenerationStatus.PENDING;
        attemptCount = 0;
        nextAttemptAt = null;
        outputJson = null;
        lastErrorCode = null;
        processingStartedAt = null;
        completedAt = null;
        activeClaimId = null;
        leaseExpiresAt = null;
        updatedAt = now;
        validateConsistency();
    }

    public boolean isDispatchableAt(Instant now) {
        Objects.requireNonNull(now, "now");
        return status == OpinionMapGenerationStatus.PENDING
                || (status == OpinionMapGenerationStatus.RETRY_WAIT
                && !nextAttemptAt.isAfter(now))
                || (status == OpinionMapGenerationStatus.PROCESSING
                && !leaseExpiresAt.isAfter(now));
    }

    private boolean ownsClaim(UUID claimId) {
        return claimId != null
                && status == OpinionMapGenerationStatus.PROCESSING
                && claimId.equals(activeClaimId);
    }

    private void makeUnavailable(String errorCode, Instant now) {
        status = OpinionMapGenerationStatus.UNAVAILABLE;
        lastErrorCode = errorCode;
        nextAttemptAt = null;
        outputJson = null;
        completedAt = now;
        activeClaimId = null;
        leaseExpiresAt = null;
        updatedAt = now;
        validateConsistency();
    }

    private void validateConsistency() {
        boolean processing = status == OpinionMapGenerationStatus.PROCESSING;
        if (processing != (activeClaimId != null && leaseExpiresAt != null)) {
            throw new IllegalArgumentException(
                    "processing claim fields do not match status");
        }
        if ((status == OpinionMapGenerationStatus.RETRY_WAIT)
                != (nextAttemptAt != null)) {
            throw new IllegalArgumentException(
                    "nextAttemptAt does not match retry status");
        }
        if ((status == OpinionMapGenerationStatus.AVAILABLE)
                != (outputJson != null)) {
            throw new IllegalArgumentException(
                    "outputJson does not match available status");
        }
        boolean terminal = status == OpinionMapGenerationStatus.AVAILABLE
                || status == OpinionMapGenerationStatus.UNAVAILABLE;
        if (terminal != (completedAt != null)) {
            throw new IllegalArgumentException(
                    "completedAt does not match terminal status");
        }
        boolean failed = status == OpinionMapGenerationStatus.RETRY_WAIT
                || status == OpinionMapGenerationStatus.UNAVAILABLE;
        if (failed != (lastErrorCode != null)) {
            throw new IllegalArgumentException(
                    "lastErrorCode does not match failed status");
        }
    }

    private static String requireSha256(String value) {
        String normalized = requireText(value, "sourceBodySha256");
        if (!normalized.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(
                    "sourceBodySha256 must be lowercase SHA-256");
        }
        return normalized;
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
        return value.trim();
    }

    public OpinionMapGenerationId id() { return id; }
    public TaskId taskId() { return taskId; }
    public int resultVersion() { return resultVersion; }
    public String sourceBodySha256() { return sourceBodySha256; }
    public String promptVersion() { return promptVersion; }
    public OpinionMapGenerationStatus status() { return status; }
    public int attemptCount() { return attemptCount; }
    public Instant nextAttemptAt() { return nextAttemptAt; }
    public String outputJson() { return outputJson; }
    public String lastErrorCode() { return lastErrorCode; }
    public Instant createdAt() { return createdAt; }
    public Instant processingStartedAt() { return processingStartedAt; }
    public Instant completedAt() { return completedAt; }
    public UUID activeClaimId() { return activeClaimId; }
    public Instant leaseExpiresAt() { return leaseExpiresAt; }
    public Instant updatedAt() { return updatedAt; }
}
