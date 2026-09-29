package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRun;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRunHistory;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRunHistoryRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Repository
public class OpinionMapGenerationRunHistoryJdbcAdapter
        implements OpinionMapGenerationRunHistoryRepository {

    private final JdbcTemplate jdbc;

    public OpinionMapGenerationRunHistoryJdbcAdapter(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public List<OpinionMapGenerationRunHistory> findByTaskId(TaskId taskId) {
        Map<UUID, RunBuilder> runs = new LinkedHashMap<>();
        jdbc.query("""
                        SELECT run.run_id,
                               generation.result_version,
                               run.run_number,
                               run.trigger_type,
                               run.status AS run_status,
                               run.attempt_count,
                               run.requested_by,
                               run.requested_at,
                               run.completed_at AS run_completed_at,
                               run.last_error_code,
                               attempt.attempt_id,
                               attempt.attempt_number,
                               attempt.status AS attempt_status,
                               attempt.provider,
                               attempt.requested_model,
                               attempt.response_model,
                               attempt.provider_generation_id,
                               attempt.provider_request_id,
                               attempt.prompt_tokens,
                               attempt.completion_tokens,
                               attempt.total_tokens,
                               attempt.cached_tokens,
                               attempt.reasoning_tokens,
                               attempt.cost,
                               attempt.currency,
                               attempt.finish_reason,
                               attempt.http_status,
                               attempt.error_code,
                               attempt.retryable,
                               attempt.started_at,
                               attempt.completed_at AS attempt_completed_at,
                               attempt.latency_ms
                        FROM opinion_map_generation_runs run
                        JOIN opinion_map_generations generation
                          ON generation.generation_id = run.generation_id
                        LEFT JOIN opinion_map_generation_attempts attempt
                          ON attempt.run_id = run.run_id
                        WHERE generation.task_id = ?
                        ORDER BY generation.result_version DESC,
                                 run.run_number DESC,
                                 attempt.attempt_number ASC
                        """,
                (RowCallbackHandler) resultSet -> append(runs, resultSet),
                taskId.value());
        return runs.values().stream().map(RunBuilder::build).toList();
    }

    private static void append(
            Map<UUID, RunBuilder> runs,
            ResultSet resultSet
    ) throws SQLException {
        UUID runId = resultSet.getObject("run_id", UUID.class);
        RunBuilder run = runs.computeIfAbsent(runId, ignored ->
                new RunBuilder(
                        runId,
                        intValue(resultSet, "result_version"),
                        intValue(resultSet, "run_number"),
                        OpinionMapGenerationRun.Trigger.valueOf(
                                string(resultSet, "trigger_type")),
                        OpinionMapGenerationRun.Status.valueOf(
                                string(resultSet, "run_status")),
                        intValue(resultSet, "attempt_count"),
                        nullableString(resultSet, "requested_by"),
                        instant(resultSet, "requested_at"),
                        instant(resultSet, "run_completed_at"),
                        nullableString(resultSet, "last_error_code")));
        UUID attemptId = resultSet.getObject("attempt_id", UUID.class);
        if (attemptId != null) {
            run.attempts.add(new OpinionMapGenerationRunHistory.Attempt(
                    attemptId,
                    intValue(resultSet, "attempt_number"),
                    string(resultSet, "attempt_status"),
                    string(resultSet, "provider"),
                    string(resultSet, "requested_model"),
                    nullableString(resultSet, "response_model"),
                    nullableString(resultSet, "provider_generation_id"),
                    nullableString(resultSet, "provider_request_id"),
                    nullableLong(resultSet, "prompt_tokens"),
                    nullableLong(resultSet, "completion_tokens"),
                    nullableLong(resultSet, "total_tokens"),
                    nullableLong(resultSet, "cached_tokens"),
                    nullableLong(resultSet, "reasoning_tokens"),
                    resultSet.getObject("cost", BigDecimal.class),
                    nullableString(resultSet, "currency"),
                    nullableString(resultSet, "finish_reason"),
                    nullableInteger(resultSet, "http_status"),
                    nullableString(resultSet, "error_code"),
                    nullableBoolean(resultSet, "retryable"),
                    instant(resultSet, "started_at"),
                    instant(resultSet, "attempt_completed_at"),
                    nullableLong(resultSet, "latency_ms")));
        }
    }

    private static String string(ResultSet resultSet, String column) {
        try {
            return resultSet.getString(column);
        } catch (SQLException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String nullableString(
            ResultSet resultSet,
            String column
    ) {
        return string(resultSet, column);
    }

    private static int intValue(ResultSet resultSet, String column) {
        try {
            return resultSet.getInt(column);
        } catch (SQLException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static Long nullableLong(ResultSet resultSet, String column) {
        try {
            long value = resultSet.getLong(column);
            return resultSet.wasNull() ? null : value;
        } catch (SQLException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static Integer nullableInteger(
            ResultSet resultSet,
            String column
    ) {
        try {
            int value = resultSet.getInt(column);
            return resultSet.wasNull() ? null : value;
        } catch (SQLException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static Boolean nullableBoolean(
            ResultSet resultSet,
            String column
    ) {
        try {
            boolean value = resultSet.getBoolean(column);
            return resultSet.wasNull() ? null : value;
        } catch (SQLException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static Instant instant(ResultSet resultSet, String column) {
        try {
            Timestamp value = resultSet.getTimestamp(column);
            return value == null ? null : value.toInstant();
        } catch (SQLException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static final class RunBuilder {
        private final UUID runId;
        private final int resultVersion;
        private final int runNumber;
        private final OpinionMapGenerationRun.Trigger trigger;
        private final OpinionMapGenerationRun.Status status;
        private final int attemptCount;
        private final String requestedBy;
        private final Instant requestedAt;
        private final Instant completedAt;
        private final String lastErrorCode;
        private final List<OpinionMapGenerationRunHistory.Attempt> attempts =
                new ArrayList<>();

        private RunBuilder(
                UUID runId,
                int resultVersion,
                int runNumber,
                OpinionMapGenerationRun.Trigger trigger,
                OpinionMapGenerationRun.Status status,
                int attemptCount,
                String requestedBy,
                Instant requestedAt,
                Instant completedAt,
                String lastErrorCode
        ) {
            this.runId = runId;
            this.resultVersion = resultVersion;
            this.runNumber = runNumber;
            this.trigger = trigger;
            this.status = status;
            this.attemptCount = attemptCount;
            this.requestedBy = requestedBy;
            this.requestedAt = requestedAt;
            this.completedAt = completedAt;
            this.lastErrorCode = lastErrorCode;
        }

        private OpinionMapGenerationRunHistory build() {
            return new OpinionMapGenerationRunHistory(
                    runId,
                    resultVersion,
                    runNumber,
                    trigger,
                    status,
                    attemptCount,
                    requestedBy,
                    requestedAt,
                    completedAt,
                    lastErrorCode,
                    attempts);
        }
    }
}
