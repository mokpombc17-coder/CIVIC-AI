package com.hamcheeze.vote.task.infra.prediction;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class TaskPredictionStatusQueryTest {

    private static final Instant INITIAL =
            Instant.parse("2026-08-21T03:00:00Z");
    private static final TaskPredictionStatusQuery.Snapshot SNAPSHOT =
            new TaskPredictionStatusQuery.Snapshot(
                    1, 2, 3, 4, 5, 6, 7, 8);

    @Test
    void reusesOneAggregateSnapshotForEveryGaugeWithinTtl() {
        CountingJdbcTemplate jdbc = new CountingJdbcTemplate();
        MutableClock clock = new MutableClock(INITIAL);
        TaskPredictionStatusQuery query = new TaskPredictionStatusQuery(
                jdbc, clock, Duration.ofSeconds(1));

        List<TaskPredictionStatusQuery.Snapshot> snapshots = new ArrayList<>();
        for (int index = 0; index < 8; index++) {
            snapshots.add(query.snapshot());
        }

        assertThat(jdbc.queryCount()).isEqualTo(1);
        assertThat(snapshots).allMatch(snapshot -> snapshot == SNAPSHOT);

        clock.set(INITIAL.plusSeconds(1));
        assertThat(query.snapshot()).isSameAs(SNAPSHOT);
        assertThat(jdbc.queryCount()).isEqualTo(2);
    }

    @Test
    void concurrentCacheMissLoadsOneAggregateSnapshot() throws Exception {
        CountingJdbcTemplate jdbc = new CountingJdbcTemplate();
        TaskPredictionStatusQuery query = new TaskPredictionStatusQuery(
                jdbc, new MutableClock(INITIAL), Duration.ofSeconds(1));
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(8)) {
            var futures = new ArrayList<
                    java.util.concurrent.Future<
                            TaskPredictionStatusQuery.Snapshot>>();
            for (int index = 0; index < 8; index++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    return query.snapshot();
                }));
            }
            start.countDown();
            for (var future : futures) {
                assertThat(future.get(5, TimeUnit.SECONDS))
                        .isSameAs(SNAPSHOT);
            }
        }

        assertThat(jdbc.queryCount()).isEqualTo(1);
    }

    private static final class CountingJdbcTemplate extends JdbcTemplate {

        private final AtomicInteger queries = new AtomicInteger();

        @Override
        @SuppressWarnings("unchecked")
        public <T> T queryForObject(
                String sql,
                RowMapper<T> rowMapper,
                Object... args
        ) {
            queries.incrementAndGet();
            return (T) SNAPSHOT;
        }

        int queryCount() {
            return queries.get();
        }
    }

    private static final class MutableClock extends Clock {

        private final AtomicReference<Instant> now;

        private MutableClock(Instant now) {
            this.now = new AtomicReference<>(now);
        }

        void set(Instant instant) {
            now.set(instant);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    }
}
