package com.hamcheeze.vote.task.infra.prediction;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Clock;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.Objects;

@Component
public class TaskPredictionStatusQuery {

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    @Autowired
    public TaskPredictionStatusQuery(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, Clock.systemUTC());
    }

    TaskPredictionStatusQuery(JdbcTemplate jdbcTemplate, Clock clock) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public Snapshot snapshot() {
        Instant now = clock.instant();
        return Objects.requireNonNull(jdbcTemplate.queryForObject("""
                SELECT
                    count(*) FILTER (WHERE prediction.status = 'PENDING'),
                    count(*) FILTER (WHERE prediction.status = 'PROCESSING'),
                    count(*) FILTER (WHERE prediction.status = 'PROCESSING'
                        AND prediction.lease_expires_at <= ?),
                    count(*) FILTER (WHERE prediction.status = 'RETRY_WAIT'),
                    count(*) FILTER (WHERE prediction.status = 'FAILED'),
                    count(*) FILTER (WHERE input.prediction_id IS NULL),
                    COALESCE(EXTRACT(EPOCH FROM (? - min(
                        prediction.created_at) FILTER (
                            WHERE prediction.status = 'PENDING'))), 0),
                    COALESCE(EXTRACT(EPOCH FROM (? - min(
                        prediction.processing_started_at) FILTER (
                            WHERE prediction.status = 'PROCESSING'))), 0)
                FROM task_predictions prediction
                LEFT JOIN task_prediction_inputs input
                  ON input.prediction_id = prediction.prediction_id
                """, (resultSet, rowNumber) -> new Snapshot(
                        resultSet.getLong(1), resultSet.getLong(2),
                        resultSet.getLong(3), resultSet.getLong(4),
                        resultSet.getLong(5), resultSet.getLong(6),
                        Math.max(0, resultSet.getDouble(7)),
                        Math.max(0, resultSet.getDouble(8))),
                Timestamp.from(now), Timestamp.from(now),
                Timestamp.from(now)));
    }

    public record Snapshot(
            long pendingCount,
            long processingCount,
            long staleProcessingCount,
            long retryWaitCount,
            long terminalFailedCount,
            long missingInputCount,
            double oldestPendingAgeSeconds,
            double oldestProcessingAgeSeconds
    ) {
    }
}
