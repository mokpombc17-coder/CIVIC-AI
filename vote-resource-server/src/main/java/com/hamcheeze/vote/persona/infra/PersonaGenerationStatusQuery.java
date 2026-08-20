package com.hamcheeze.vote.persona.infra;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

@Component
public class PersonaGenerationStatusQuery {

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;
    private final Duration cacheDuration;
    private volatile CachedSnapshot cachedSnapshot;

    @Autowired
    public PersonaGenerationStatusQuery(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, Clock.systemUTC(), Duration.ofSeconds(1));
    }

    PersonaGenerationStatusQuery(
            JdbcTemplate jdbcTemplate,
            Clock clock,
            Duration cacheDuration
    ) {
        this.jdbcTemplate = Objects.requireNonNull(
                jdbcTemplate, "jdbcTemplate");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.cacheDuration = Objects.requireNonNull(
                cacheDuration, "cacheDuration");
    }

    public Snapshot snapshot() {
        Instant now = clock.instant();
        CachedSnapshot current = cachedSnapshot;
        if (current != null && now.isBefore(current.expiresAt())) {
            return current.snapshot();
        }
        synchronized (this) {
            current = cachedSnapshot;
            if (current != null && now.isBefore(current.expiresAt())) {
                return current.snapshot();
            }
            Snapshot loaded = load(now);
            cachedSnapshot = new CachedSnapshot(
                    loaded, now.plus(cacheDuration));
            return loaded;
        }
    }

    private Snapshot load(Instant now) {
        return jdbcTemplate.queryForObject(
                """
                SELECT
                    count(*) FILTER (WHERE status = 'PENDING') pending_count,
                    count(*) FILTER (WHERE status = 'PROCESSING') processing_count,
                    count(*) FILTER (
                        WHERE status = 'PROCESSING'
                          AND lease_expires_at <= ?
                    ) stale_processing_count,
                    count(*) FILTER (
                        WHERE status = 'FAILED'
                          AND next_attempt_at IS NOT NULL
                    ) retry_wait_count,
                    count(*) FILTER (
                        WHERE status = 'FAILED'
                          AND next_attempt_at IS NULL
                    ) terminal_failed_count,
                    count(*) FILTER (
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM persona_generation_inputs input
                            WHERE input.generation_id = persona_generations.generation_id
                        )
                    ) missing_input_count,
                    min(created_at) FILTER (
                        WHERE status = 'PENDING'
                    ) oldest_pending_at,
                    min(processing_started_at) FILTER (
                        WHERE status = 'PROCESSING'
                    ) oldest_processing_at
                FROM persona_generations
                """,
                (resultSet, rowNumber) -> new Snapshot(
                        resultSet.getLong("pending_count"),
                        resultSet.getLong("processing_count"),
                        resultSet.getLong("stale_processing_count"),
                        resultSet.getLong("retry_wait_count"),
                        resultSet.getLong("terminal_failed_count"),
                        resultSet.getLong("missing_input_count"),
                        age(now, resultSet.getTimestamp(
                                "oldest_pending_at")),
                        age(now, resultSet.getTimestamp(
                                "oldest_processing_at"))),
                Timestamp.from(now));
    }

    private static long age(Instant now, Timestamp timestamp) {
        if (timestamp == null) {
            return 0;
        }
        return Math.max(0, Duration.between(
                timestamp.toInstant(), now).toSeconds());
    }

    public record Snapshot(
            long pendingCount,
            long processingCount,
            long staleProcessingCount,
            long retryWaitCount,
            long terminalFailedCount,
            long missingInputCount,
            long oldestPendingAgeSeconds,
            long oldestProcessingAgeSeconds
    ) {
    }

    private record CachedSnapshot(Snapshot snapshot, Instant expiresAt) {
    }
}
