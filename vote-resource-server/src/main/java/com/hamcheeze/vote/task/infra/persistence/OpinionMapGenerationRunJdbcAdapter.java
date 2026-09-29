package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRun;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRunClaim;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRunRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
public class OpinionMapGenerationRunJdbcAdapter
        implements OpinionMapGenerationRunRepository {

    private final JdbcTemplate jdbc;

    public OpinionMapGenerationRunJdbcAdapter(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    @Transactional
    public UUID startInitialAttempt(
            OpinionMapGeneration generation,
            UUID claimId,
            int attemptNumber,
            Instant startedAt,
            Duration leaseDuration
    ) {
        Objects.requireNonNull(generation, "generation");
        List<UUID> active = jdbc.query("""
                        SELECT run_id
                        FROM opinion_map_generation_runs
                        WHERE generation_id = ?
                          AND trigger_type IN ('TASK_CLOSED', 'ADMIN_RETRY')
                          AND status IN ('PENDING', 'PROCESSING', 'RETRY_WAIT')
                        ORDER BY run_number DESC
                        FOR UPDATE
                        LIMIT 1
                        """,
                (resultSet, rowNumber) -> resultSet.getObject(
                        "run_id", UUID.class),
                generation.id().value());
        UUID runId;
        if (active.isEmpty()) {
            runId = UUID.randomUUID();
            jdbc.update("""
                        INSERT INTO opinion_map_generation_runs (
                            run_id,
                            generation_id,
                            run_number,
                            trigger_type,
                            status,
                            attempt_count,
                            requested_at,
                            processing_started_at,
                            active_claim_id,
                            lease_expires_at,
                            updated_at
                        )
                        SELECT ?, ?, COALESCE(MAX(run_number), 0) + 1,
                               'TASK_CLOSED', 'PROCESSING', ?, ?, ?, ?, ?, ?
                        FROM opinion_map_generation_runs
                        WHERE generation_id = ?
                        """,
                    runId,
                    generation.id().value(),
                    attemptNumber,
                    Timestamp.from(generation.createdAt()),
                    Timestamp.from(startedAt),
                    claimId,
                    Timestamp.from(startedAt.plus(leaseDuration)),
                    Timestamp.from(startedAt),
                    generation.id().value());
        } else {
            runId = active.getFirst();
            jdbc.update("""
                        UPDATE opinion_map_generation_runs
                        SET
                            status = 'PROCESSING',
                            attempt_count = ?,
                            next_attempt_at = NULL,
                            last_error_code = NULL,
                            processing_started_at = ?,
                            completed_at = NULL,
                            active_claim_id = ?,
                            lease_expires_at = ?,
                            updated_at = ?
                        WHERE run_id = ?
                        """,
                    attemptNumber,
                    Timestamp.from(startedAt),
                    claimId,
                    Timestamp.from(startedAt.plus(leaseDuration)),
                    Timestamp.from(startedAt),
                    runId);
        }
        return runId;
    }

    @Override
    @Transactional
    public OpinionMapGenerationRun enqueueManualRetry(
            OpinionMapGenerationId generationId,
            String requestedBy,
            Instant requestedAt
    ) {
        return enqueue(
                generationId,
                requestedBy,
                null,
                requestedAt,
                OpinionMapGenerationRun.Trigger.ADMIN_RETRY);
    }

    @Override
    @Transactional
    public OpinionMapGenerationRun enqueueRegeneration(
            OpinionMapGenerationId generationId,
            String requestedBy,
            String idempotencyKey,
            Instant requestedAt
    ) {
        return enqueue(
                generationId,
                requestedBy,
                idempotencyKey,
                requestedAt,
                OpinionMapGenerationRun.Trigger.ADMIN_REGENERATE);
    }

    private OpinionMapGenerationRun enqueue(
            OpinionMapGenerationId generationId,
            String requestedBy,
            String idempotencyKey,
            Instant requestedAt,
            OpinionMapGenerationRun.Trigger trigger
    ) {
        UUID runId = UUID.randomUUID();
        List<OpinionMapGenerationRun> inserted = jdbc.query("""
                        INSERT INTO opinion_map_generation_runs (
                            run_id,
                            generation_id,
                            run_number,
                            trigger_type,
                            status,
                            attempt_count,
                            requested_by,
                            idempotency_key,
                            requested_at,
                            updated_at
                        )
                        SELECT ?, ?,
                               COALESCE(MAX(run_number), 0) + 1,
                               ?,
                               'PENDING',
                               0,
                               ?, ?, ?, ?
                        FROM opinion_map_generation_runs
                        WHERE generation_id = ?
                        RETURNING *
                        """,
                (resultSet, rowNumber) -> run(resultSet),
                runId,
                generationId.value(),
                trigger.name(),
                requestedBy,
                idempotencyKey,
                Timestamp.from(requestedAt),
                Timestamp.from(requestedAt),
                generationId.value());
        if (inserted.size() != 1) {
            throw new IllegalStateException(
                    "Opinion Map regeneration was not enqueued");
        }
        return inserted.getFirst();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OpinionMapGenerationRun> findActiveRegeneration(
            OpinionMapGenerationId generationId
    ) {
        return jdbc.query("""
                        SELECT *
                        FROM opinion_map_generation_runs
                        WHERE generation_id = ?
                          AND trigger_type = 'ADMIN_REGENERATE'
                          AND status IN ('PENDING', 'PROCESSING', 'RETRY_WAIT')
                        ORDER BY run_number DESC
                        LIMIT 1
                        """,
                (resultSet, rowNumber) -> run(resultSet),
                generationId.value()).stream().findFirst();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OpinionMapGenerationRun> findRegenerationByIdempotencyKey(
            OpinionMapGenerationId generationId,
            String idempotencyKey
    ) {
        if (idempotencyKey == null) {
            return Optional.empty();
        }
        return jdbc.query("""
                        SELECT *
                        FROM opinion_map_generation_runs
                        WHERE generation_id = ?
                          AND trigger_type = 'ADMIN_REGENERATE'
                          AND idempotency_key = ?
                        LIMIT 1
                        """,
                (resultSet, rowNumber) -> run(resultSet),
                generationId.value(),
                idempotencyKey).stream().findFirst();
    }

    @Override
    @Transactional
    public Optional<OpinionMapGenerationRunClaim> claimNextRegeneration(
            Instant now,
            Duration leaseDuration,
            int maximumAttempts
    ) {
        UUID claimId = UUID.randomUUID();
        return jdbc.query("""
                        WITH candidate AS (
                            SELECT run.run_id
                            FROM opinion_map_generation_runs run
                            WHERE run.trigger_type = 'ADMIN_REGENERATE'
                              AND run.attempt_count < ?
                              AND (
                                  run.status = 'PENDING'
                                  OR (run.status = 'RETRY_WAIT'
                                      AND run.next_attempt_at <= ?)
                                  OR (run.status = 'PROCESSING'
                                      AND run.lease_expires_at <= ?))
                            ORDER BY COALESCE(
                                         run.next_attempt_at,
                                         run.lease_expires_at,
                                         run.requested_at),
                                     run.requested_at,
                                     run.run_id
                            FOR UPDATE SKIP LOCKED
                            LIMIT 1
                        ), claimed AS (
                            UPDATE opinion_map_generation_runs run
                            SET status = 'PROCESSING',
                                attempt_count = run.attempt_count + 1,
                                next_attempt_at = NULL,
                                last_error_code = NULL,
                                processing_started_at = ?,
                                completed_at = NULL,
                                active_claim_id = ?,
                                lease_expires_at = ?,
                                updated_at = ?
                            FROM candidate
                            WHERE run.run_id = candidate.run_id
                            RETURNING run.*
                        )
                        SELECT claimed.run_id,
                               claimed.generation_id,
                               claimed.active_claim_id,
                               claimed.attempt_count,
                               generation.task_id,
                               generation.result_version,
                               generation.source_body_sha256,
                               generation.prompt_version
                        FROM claimed
                        JOIN opinion_map_generations generation
                          ON generation.generation_id = claimed.generation_id
                        """,
                (resultSet, rowNumber) -> new OpinionMapGenerationRunClaim(
                        resultSet.getObject("run_id", UUID.class),
                        new OpinionMapGenerationId(resultSet.getObject(
                                "generation_id", UUID.class)),
                        OpinionMapGenerationRun.Trigger.ADMIN_REGENERATE,
                        resultSet.getObject("active_claim_id", UUID.class),
                        resultSet.getInt("attempt_count"),
                        new TaskId(resultSet.getObject("task_id", UUID.class)),
                        resultSet.getInt("result_version"),
                        resultSet.getString("source_body_sha256"),
                        resultSet.getString("prompt_version")),
                maximumAttempts,
                Timestamp.from(now),
                Timestamp.from(now),
                Timestamp.from(now),
                claimId,
                Timestamp.from(now.plus(leaseDuration)),
                Timestamp.from(now)).stream().findFirst();
    }

    @Override
    public boolean completeSuccess(
            UUID runId,
            UUID claimId,
            Instant completedAt
    ) {
        return jdbc.update("""
                        UPDATE opinion_map_generation_runs
                        SET status = 'AVAILABLE',
                            next_attempt_at = NULL,
                            last_error_code = NULL,
                            completed_at = ?,
                            active_claim_id = NULL,
                            lease_expires_at = NULL,
                            updated_at = ?
                        WHERE run_id = ?
                          AND status = 'PROCESSING'
                          AND active_claim_id = ?
                        """,
                Timestamp.from(completedAt),
                Timestamp.from(completedAt),
                runId,
                claimId) == 1;
    }

    @Override
    public boolean completeFailure(
            UUID runId,
            UUID claimId,
            String errorCode,
            boolean retryable,
            int maximumAttempts,
            Duration retryDelay,
            Instant completedAt
    ) {
        Instant retryAt = completedAt.plus(retryDelay);
        return jdbc.update("""
                        UPDATE opinion_map_generation_runs
                        SET status = CASE
                                WHEN ? AND attempt_count < ?
                                    THEN 'RETRY_WAIT'
                                ELSE 'UNAVAILABLE'
                            END,
                            next_attempt_at = CASE
                                WHEN ? AND attempt_count < ? THEN ?
                                ELSE NULL
                            END,
                            last_error_code = ?,
                            completed_at = CASE
                                WHEN ? AND attempt_count < ? THEN NULL
                                ELSE ?
                            END,
                            active_claim_id = NULL,
                            lease_expires_at = NULL,
                            updated_at = ?
                        WHERE run_id = ?
                          AND status = 'PROCESSING'
                          AND active_claim_id = ?
                        """,
                retryable,
                maximumAttempts,
                retryable,
                maximumAttempts,
                Timestamp.from(retryAt),
                errorCode,
                retryable,
                maximumAttempts,
                Timestamp.from(completedAt),
                Timestamp.from(completedAt),
                runId,
                claimId) == 1;
    }

    @Override
    public void synchronizeInitial(
            UUID runId,
            OpinionMapGeneration generation
    ) {
        int updated = jdbc.update("""
                        UPDATE opinion_map_generation_runs
                        SET status = ?,
                            attempt_count = ?,
                            next_attempt_at = ?,
                            last_error_code = ?,
                            processing_started_at = ?,
                            completed_at = ?,
                            active_claim_id = NULL,
                            lease_expires_at = NULL,
                            updated_at = ?
                        WHERE run_id = ?
                          AND trigger_type IN ('TASK_CLOSED', 'ADMIN_RETRY')
                        """,
                generation.status().name(),
                generation.attemptCount(),
                timestamp(generation.nextAttemptAt()),
                generation.lastErrorCode(),
                timestamp(generation.processingStartedAt()),
                timestamp(generation.completedAt()),
                Timestamp.from(generation.updatedAt()),
                runId);
        if (updated != 1) {
            throw new IllegalStateException(
                    "initial Opinion Map run does not exist: " + runId);
        }
    }

    private static OpinionMapGenerationRun run(ResultSet resultSet)
            throws SQLException {
        return new OpinionMapGenerationRun(
                resultSet.getObject("run_id", UUID.class),
                new OpinionMapGenerationId(resultSet.getObject(
                        "generation_id", UUID.class)),
                resultSet.getInt("run_number"),
                OpinionMapGenerationRun.Trigger.valueOf(
                        resultSet.getString("trigger_type")),
                OpinionMapGenerationRun.Status.valueOf(
                        resultSet.getString("status")),
                resultSet.getInt("attempt_count"),
                resultSet.getString("requested_by"),
                instant(resultSet, "requested_at"),
                instant(resultSet, "completed_at"),
                resultSet.getString("last_error_code"),
                instant(resultSet, "updated_at"));
    }

    private static Instant instant(ResultSet resultSet, String column)
            throws SQLException {
        Timestamp value = resultSet.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }
}
