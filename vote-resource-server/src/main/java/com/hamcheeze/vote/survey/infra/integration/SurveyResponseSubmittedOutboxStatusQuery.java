package com.hamcheeze.vote.survey.infra.integration;

import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

@Component
public class SurveyResponseSubmittedOutboxStatusQuery {

    private static final Duration METRIC_CACHE_DURATION =
            Duration.ofSeconds(1);

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;
    private final Duration cacheDuration;
    private volatile CachedSnapshot cachedSnapshot;

    @Autowired
    public SurveyResponseSubmittedOutboxStatusQuery(
            JdbcTemplate jdbcTemplate
    ) {
        this(jdbcTemplate, Clock.systemUTC(), METRIC_CACHE_DURATION);
    }

    SurveyResponseSubmittedOutboxStatusQuery(
            JdbcTemplate jdbcTemplate,
            Clock clock
    ) {
        this(jdbcTemplate, clock, Duration.ZERO);
    }

    SurveyResponseSubmittedOutboxStatusQuery(
            JdbcTemplate jdbcTemplate,
            Clock clock,
            Duration cacheDuration
    ) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.cacheDuration = Objects.requireNonNull(
                cacheDuration, "cacheDuration");
        if (cacheDuration.isNegative()) {
            throw new IllegalArgumentException(
                    "cacheDuration must not be negative");
        }
    }

    public Snapshot snapshot() {
        Instant observedAt = clock.instant();
        CachedSnapshot current = cachedSnapshot;
        if (current != null && observedAt.isBefore(current.expiresAt())) {
            return current.snapshot();
        }
        synchronized (this) {
            current = cachedSnapshot;
            if (current != null
                    && observedAt.isBefore(current.expiresAt())) {
                return current.snapshot();
            }
            Snapshot loaded = loadSnapshot(observedAt);
            cachedSnapshot = new CachedSnapshot(
                    loaded, observedAt.plus(cacheDuration));
            return loaded;
        }
    }

    private Snapshot loadSnapshot(Instant observedAt) {
        Counts counts = jdbcTemplate.queryForObject(
                """
                SELECT
                    count(*) FILTER (
                        WHERE published_at IS NULL
                          AND dead_lettered_at IS NULL
                    ) AS pending_count,
                    min(created_at) FILTER (
                        WHERE published_at IS NULL
                          AND dead_lettered_at IS NULL
                    ) AS oldest_pending_at,
                    count(*) FILTER (
                        WHERE dead_lettered_at IS NOT NULL
                    ) AS dead_letter_count,
                    count(*) FILTER (
                        WHERE dead_lettered_at IS NOT NULL
                          AND NOT EXISTS (
                              SELECT 1
                              FROM survey_response_submitted_replays replay
                              WHERE replay.original_event_id = event.event_id
                          )
                    ) AS unresolved_dead_letter_count
                FROM integration_outbox event
                WHERE event_type = ?
                """,
                (resultSet, rowNumber) -> new Counts(
                        resultSet.getLong("pending_count"),
                        timestamp(resultSet, "oldest_pending_at"),
                        resultSet.getLong("dead_letter_count"),
                        resultSet.getLong(
                                "unresolved_dead_letter_count")),
                SurveyResponseSubmittedV1.EVENT_TYPE);
        long missingEventCount = jdbcTemplate.queryForObject(
                """
                SELECT count(*)
                FROM survey_responses response
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM integration_outbox event
                    WHERE event.event_type = ?
                      AND event.aggregate_id = response.response_id
                )
                """,
                Long.class,
                SurveyResponseSubmittedV1.EVENT_TYPE);
        return new Snapshot(
                counts.pendingCount(),
                pendingAgeSeconds(
                        counts.oldestPendingAt(), observedAt),
                counts.deadLetterCount(),
                counts.unresolvedDeadLetterCount(),
                missingEventCount);
    }

    private static long pendingAgeSeconds(
            Instant oldestPendingAt,
            Instant observedAt
    ) {
        if (oldestPendingAt == null) {
            return 0L;
        }
        return Math.max(
                0L,
                Duration.between(oldestPendingAt, observedAt).toSeconds());
    }

    private static Instant timestamp(
            java.sql.ResultSet resultSet,
            String column
    ) throws java.sql.SQLException {
        Timestamp value = resultSet.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private record Counts(
            long pendingCount,
            Instant oldestPendingAt,
            long deadLetterCount,
            long unresolvedDeadLetterCount
    ) {
    }

    private record CachedSnapshot(
            Snapshot snapshot,
            Instant expiresAt
    ) {
    }

    public record Snapshot(
            long pendingCount,
            long oldestPendingAgeSeconds,
            long deadLetterCount,
            long unresolvedDeadLetterCount,
            long missingEventCount
    ) {
    }
}
