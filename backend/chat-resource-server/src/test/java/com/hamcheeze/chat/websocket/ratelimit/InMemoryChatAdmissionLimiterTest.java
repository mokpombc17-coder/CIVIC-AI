package com.hamcheeze.chat.websocket.ratelimit;

import com.hamcheeze.chat.metrics.ThrowingMeterRegistry;
import com.hamcheeze.chat.websocket.config.ChatAdmissionProperties;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InMemoryChatAdmissionLimiterTest {

    @Test
    void rollbackAfterRefillAndAnotherCommitDoesNotCreateTokens() {
        MutableTimeSource time = new MutableTimeSource();
        InMemoryChatAdmissionLimiter limiter = limiter(time);

        AdmissionReservation a = limiter.tryReserve("user-1", 4);
        time.advanceMillis(1_000);
        AdmissionReservation b = limiter.tryReserve("user-1", 1);
        b.commit();
        a.close();

        InMemoryChatAdmissionLimiter.UserBucketSnapshot snapshot =
                limiter.userBucketSnapshot("user-1");
        assertThat(snapshot.refilledBalance()).isEqualTo(4.0);
        assertThat(snapshot.pendingTokenCost()).isZero();
        assertThat(snapshot.effectiveAvailable()).isEqualTo(4.0);
    }

    @Test
    void pendingBucketIsNotEvictedByTtl() {
        MutableTimeSource time = new MutableTimeSource();
        ChatAdmissionProperties properties = properties();
        properties.getUser().setBucketIdleTtlMs(100);
        InMemoryChatAdmissionLimiter limiter =
                limiter(properties, time);

        AdmissionReservation reservation =
                limiter.tryReserve("user-1", 1);
        time.advanceMillis(1_000);

        assertThat(limiter.evictIdleUserBuckets()).isZero();
        assertThat(limiter.userBucketSnapshot("user-1")).isNotNull();

        reservation.close();
        time.advanceMillis(101);
        assertThat(limiter.evictIdleUserBuckets()).isOne();
    }

    @Test
    void busyRollbackReturnsUserAndGlobalCapacity() {
        MutableTimeSource time = new MutableTimeSource();
        InMemoryChatAdmissionLimiter limiter = limiter(time);

        AdmissionReservation reservation =
                limiter.tryReserve("user-1", 5);
        assertThat(limiter.globalEntryCount()).isOne();
        reservation.close();

        assertThat(limiter.globalEntryCount()).isZero();
        assertThat(limiter.tryReserve("user-1", 5).granted()).isTrue();
        assertThatThrownBy(reservation::commit)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void commitAndCloseAreIdempotent() {
        InMemoryChatAdmissionLimiter limiter =
                limiter(new MutableTimeSource());
        AdmissionReservation reservation =
                limiter.tryReserve("user-1", 1);

        reservation.commit();
        reservation.commit();
        reservation.close();
        reservation.close();

        assertThat(limiter.globalEntryCount()).isOne();
        assertThat(limiter.userBucketSnapshot("user-1").pendingTokenCost())
                .isZero();
    }

    @Test
    void sustainedWindowRejectsTheFiveHundredAndFirstCommand() {
        MutableTimeSource time = new MutableTimeSource();
        InMemoryChatAdmissionLimiter limiter = limiter(time);

        for (int batch = 0; batch < 5; batch++) {
            if (batch > 0) {
                time.advanceMillis(1_001);
            }
            for (int index = 0; index < 100; index++) {
                AdmissionReservation reservation = limiter.tryReserve(
                        "user-" + batch + "-" + index, 1);
                assertThat(reservation.granted()).isTrue();
                reservation.commit();
            }
        }
        time.advanceMillis(1_001);

        AdmissionReservation rejected =
                limiter.tryReserve("user-over-limit", 1);
        assertThat(rejected.outcome())
                .isEqualTo(AdmissionOutcome.GLOBAL_SOURCE_LIMITED);
        assertThat(rejected.retryAfterMs()).isPositive();
    }

    @Test
    void pendingGlobalEntriesDoNotExpireDuringWindowCleanup() {
        MutableTimeSource time = new MutableTimeSource();
        InMemoryChatAdmissionLimiter limiter = limiter(time);
        List<AdmissionReservation> reservations =
                new CopyOnWriteArrayList<>();
        for (int index = 0; index < 100; index++) {
            reservations.add(
                    limiter.tryReserve("user-" + index, 1));
        }
        time.advanceMillis(20_000);

        assertThat(limiter.tryReserve("user-101", 1).outcome())
                .isEqualTo(AdmissionOutcome.GLOBAL_SOURCE_LIMITED);
        assertThat(limiter.globalEntryCount()).isEqualTo(100);
        reservations.forEach(AdmissionReservation::close);
    }

    @Test
    void userLimitHasPriorityWhenBothLimitsAreExceeded() {
        MutableTimeSource time = new MutableTimeSource();
        InMemoryChatAdmissionLimiter limiter = limiter(time);
        AdmissionReservation userReservation =
                limiter.tryReserve("limited-user", 5);
        userReservation.commit();
        for (int index = 0; index < 99; index++) {
            AdmissionReservation reservation =
                    limiter.tryReserve("other-" + index, 1);
            reservation.commit();
        }

        assertThat(limiter.tryReserve("limited-user", 1).outcome())
                .isEqualTo(AdmissionOutcome.USER_RATE_LIMITED);
    }

    @Test
    void userLimitMetricFailureKeepsUserLimitedOutcome() {
        MutableTimeSource time = new MutableTimeSource();
        InMemoryChatAdmissionLimiter limiter = limiter(
                properties(),
                ThrowingMeterRegistry.counter(
                        "chat.rate_limited.user"),
                time);
        AdmissionReservation first =
                limiter.tryReserve("limited-user", 5);
        first.commit();

        assertThat(limiter.tryReserve(
                "limited-user", 1).outcome())
                .isEqualTo(AdmissionOutcome.USER_RATE_LIMITED);
    }

    @Test
    void globalLimitMetricFailureKeepsGlobalLimitedOutcome() {
        MutableTimeSource time = new MutableTimeSource();
        ChatAdmissionProperties properties = properties();
        properties.getGlobalSource().setBurstMaxAccepted(1);
        InMemoryChatAdmissionLimiter limiter = limiter(
                properties,
                ThrowingMeterRegistry.counter(
                        "chat.rate_limited.global"),
                time);
        AdmissionReservation first =
                limiter.tryReserve("user-1", 1);

        assertThat(limiter.tryReserve("user-2", 1).outcome())
                .isEqualTo(
                        AdmissionOutcome.GLOBAL_SOURCE_LIMITED);
        first.close();
    }

    @Test
    void admittedMetricFailureDoesNotChangeGrantedCommit() {
        MutableTimeSource time = new MutableTimeSource();
        InMemoryChatAdmissionLimiter limiter = limiter(
                properties(),
                ThrowingMeterRegistry.counter(
                        "chat.command.admitted"),
                time);
        AdmissionReservation reservation =
                limiter.tryReserve("user-1", 1);

        assertThat(reservation.outcome())
                .isEqualTo(AdmissionOutcome.GRANTED);
        assertThatCode(reservation::commit)
                .doesNotThrowAnyException();
    }

    @Test
    void concurrentPendingReservationsNeverExceedBurstLimit()
            throws Exception {
        MutableTimeSource time = new MutableTimeSource();
        InMemoryChatAdmissionLimiter limiter = limiter(time);
        int attempts = 200;
        AtomicInteger granted = new AtomicInteger();
        List<AdmissionReservation> reservations =
                new CopyOnWriteArrayList<>();
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(16)) {
            for (int index = 0; index < attempts; index++) {
                int user = index;
                executor.submit(() -> {
                    start.await();
                    AdmissionReservation reservation =
                            limiter.tryReserve("user-" + user, 1);
                    if (reservation.granted()) {
                        granted.incrementAndGet();
                        reservations.add(reservation);
                    }
                    return null;
                });
            }
            start.countDown();
            executor.shutdown();
            assertThat(executor.awaitTermination(10, TimeUnit.SECONDS))
                    .isTrue();
        }

        assertThat(granted).hasValue(100);
        assertThat(limiter.globalEntryCount()).isEqualTo(100);
        reservations.forEach(AdmissionReservation::close);
        assertThat(limiter.globalEntryCount()).isZero();
    }

    private static InMemoryChatAdmissionLimiter limiter(
            MutableTimeSource time
    ) {
        return limiter(properties(), time);
    }

    private static InMemoryChatAdmissionLimiter limiter(
            ChatAdmissionProperties properties,
            MutableTimeSource time
    ) {
        return limiter(
                properties,
                new SimpleMeterRegistry(),
                time);
    }

    private static InMemoryChatAdmissionLimiter limiter(
            ChatAdmissionProperties properties,
            MeterRegistry meterRegistry,
            MutableTimeSource time
    ) {
        return new InMemoryChatAdmissionLimiter(
                properties, meterRegistry, time);
    }

    private static ChatAdmissionProperties properties() {
        return new ChatAdmissionProperties();
    }

    private static final class MutableTimeSource implements TimeSource {
        private long nanos;

        @Override
        public long nanoTime() {
            return nanos;
        }

        void advanceMillis(long millis) {
            nanos += TimeUnit.MILLISECONDS.toNanos(millis);
        }
    }
}
