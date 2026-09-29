package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAttempt;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationException;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationGatewayResult;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationAttemptRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Repository
public class OpinionMapGenerationAttemptJdbcAdapter
        implements OpinionMapGenerationAttemptRepository {

    private final JdbcTemplate jdbc;

    public OpinionMapGenerationAttemptJdbcAdapter(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    @Transactional
    public void insert(OpinionMapGenerationAttempt attempt) {
        jdbc.update("""
                        UPDATE opinion_map_generation_attempts
                        SET status = 'FAILED',
                            error_code = 'OPINION_MAP_ATTEMPT_LEASE_EXPIRED',
                            retryable = true,
                            completed_at = ?,
                            latency_ms = GREATEST(
                                0,
                                EXTRACT(EPOCH FROM (? - started_at))
                                    * 1000)::bigint
                        WHERE run_id = ?
                          AND status = 'STARTED'
                        """,
                Timestamp.from(attempt.startedAt()),
                Timestamp.from(attempt.startedAt()),
                attempt.runId());
        jdbc.update("""
                        INSERT INTO opinion_map_generation_attempts (
                            attempt_id,
                            run_id,
                            attempt_number,
                            status,
                            provider,
                            requested_model,
                            started_at
                        ) VALUES (?, ?, ?, 'STARTED', ?, ?, ?)
                        """,
                attempt.attemptId(),
                attempt.runId(),
                attempt.attemptNumber(),
                attempt.provider(),
                attempt.requestedModel(),
                Timestamp.from(attempt.startedAt()));
    }

    @Override
    public void completeSuccess(
            UUID attemptId,
            OpinionMapGenerationGatewayResult result,
            Instant completedAt,
            long latencyMs
    ) {
        int updated = jdbc.update("""
                        UPDATE opinion_map_generation_attempts
                        SET status = 'SUCCEEDED',
                            response_model = ?,
                            provider_generation_id = ?,
                            provider_request_id = ?,
                            prompt_tokens = ?,
                            completion_tokens = ?,
                            total_tokens = ?,
                            cached_tokens = ?,
                            reasoning_tokens = ?,
                            cost = ?,
                            currency = ?,
                            finish_reason = ?,
                            http_status = ?,
                            completed_at = ?,
                            latency_ms = ?
                        WHERE attempt_id = ?
                          AND status = 'STARTED'
                        """,
                result.responseModel(),
                result.providerGenerationId(),
                result.providerRequestId(),
                result.promptTokens(),
                result.completionTokens(),
                result.totalTokens(),
                result.cachedTokens(),
                result.reasoningTokens(),
                result.cost(),
                result.currency(),
                result.finishReason(),
                result.httpStatus(),
                Timestamp.from(completedAt),
                latencyMs,
                attemptId);
        requireUpdated(updated, attemptId);
    }

    @Override
    public void completeFailure(
            UUID attemptId,
            OpinionMapGenerationException failure,
            Instant completedAt,
            long latencyMs
    ) {
        int updated = jdbc.update("""
                        UPDATE opinion_map_generation_attempts
                        SET status = 'FAILED',
                            error_code = ?,
                            retryable = ?,
                            http_status = ?,
                            completed_at = ?,
                            latency_ms = ?
                        WHERE attempt_id = ?
                          AND status = 'STARTED'
                        """,
                failure.errorCode(),
                failure.retryable(),
                failure.httpStatus(),
                Timestamp.from(completedAt),
                latencyMs,
                attemptId);
        requireUpdated(updated, attemptId);
    }

    private static void requireUpdated(int updated, UUID attemptId) {
        if (updated != 1) {
            throw new IllegalStateException(
                    "Opinion Map attempt is not STARTED: " + attemptId);
        }
    }
}
