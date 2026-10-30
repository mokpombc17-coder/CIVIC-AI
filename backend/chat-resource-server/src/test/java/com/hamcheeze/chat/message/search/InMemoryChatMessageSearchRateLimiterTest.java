package com.hamcheeze.chat.message.search;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

class InMemoryChatMessageSearchRateLimiterTest {

    @Test
    void allowsBurstThenReportsRetryAndRefills() {
        AtomicLong now = new AtomicLong();
        InMemoryChatMessageSearchRateLimiter limiter =
                new InMemoryChatMessageSearchRateLimiter(
                        1,
                        3,
                        now::get);

        assertThat(limiter.tryAcquire("user-1").allowed()).isTrue();
        assertThat(limiter.tryAcquire("user-1").allowed()).isTrue();
        assertThat(limiter.tryAcquire("user-1").allowed()).isTrue();
        ChatMessageSearchRateLimitDecision rejected =
                limiter.tryAcquire("user-1");

        assertThat(rejected.allowed()).isFalse();
        assertThat(rejected.retryAfterMs()).isBetween(1L, 1_001L);

        now.addAndGet(Duration.ofSeconds(1).toNanos());
        assertThat(limiter.tryAcquire("user-1").allowed()).isTrue();
    }

    @Test
    void isolatesUsersAndEvictsIdleBuckets() {
        AtomicLong now = new AtomicLong();
        InMemoryChatMessageSearchRateLimiter limiter =
                new InMemoryChatMessageSearchRateLimiter(
                        1,
                        1,
                        now::get);

        assertThat(limiter.tryAcquire("user-1").allowed()).isTrue();
        assertThat(limiter.tryAcquire("user-1").allowed()).isFalse();
        assertThat(limiter.tryAcquire("user-2").allowed()).isTrue();
        assertThat(limiter.bucketCount()).isEqualTo(2);

        now.addAndGet(Duration.ofMinutes(10).toNanos());
        assertThat(limiter.tryAcquire("user-3").allowed()).isTrue();
        assertThat(limiter.bucketCount()).isEqualTo(1);
    }

    @Test
    void concurrentRequestsCannotExceedBurst() throws Exception {
        InMemoryChatMessageSearchRateLimiter limiter =
                new InMemoryChatMessageSearchRateLimiter(
                        1,
                        3,
                        () -> 0L);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(10)) {
            var futures = java.util.stream.IntStream.range(0, 20)
                    .mapToObj(ignored -> executor.submit(() -> {
                        start.await();
                        return limiter.tryAcquire("user-1").allowed();
                    }))
                    .toList();
            start.countDown();

            int allowed = 0;
            for (var future : futures) {
                if (future.get()) {
                    allowed++;
                }
            }
            assertThat(allowed).isEqualTo(3);
        }
    }
}
