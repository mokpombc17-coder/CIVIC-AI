package com.hamcheeze.chat.message.search;

import java.time.Duration;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongSupplier;

public final class InMemoryChatMessageSearchRateLimiter
        implements ChatMessageSearchRateLimiter {

    private static final long NANOS_PER_SECOND =
            TimeUnit.SECONDS.toNanos(1);
    private static final long BUCKET_IDLE_TTL_NANOS =
            Duration.ofMinutes(10).toNanos();
    private static final long EVICTION_INTERVAL_NANOS =
            Duration.ofMinutes(1).toNanos();

    private final ReentrantLock lock = new ReentrantLock();
    private final Map<String, Bucket> buckets = new HashMap<>();
    private final int tokensPerSecond;
    private final int burst;
    private final LongSupplier nanoTime;
    private long lastEvictionNanos;
    private boolean evictionInitialized;

    public InMemoryChatMessageSearchRateLimiter(
            int tokensPerSecond,
            int burst
    ) {
        this(tokensPerSecond, burst, System::nanoTime);
    }

    InMemoryChatMessageSearchRateLimiter(
            int tokensPerSecond,
            int burst,
            LongSupplier nanoTime
    ) {
        if (tokensPerSecond < 1 || burst < 1) {
            throw new IllegalArgumentException(
                    "search rate limit values must be positive");
        }
        this.tokensPerSecond = tokensPerSecond;
        this.burst = burst;
        this.nanoTime = Objects.requireNonNull(nanoTime, "nanoTime");
    }

    @Override
    public ChatMessageSearchRateLimitDecision tryAcquire(
            String userId
    ) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException(
                    "userId must not be blank");
        }
        long now = nanoTime.getAsLong();
        lock.lock();
        try {
            evictIdleBuckets(now);
            Bucket bucket = buckets.computeIfAbsent(
                    userId,
                    ignored -> new Bucket(burst, now));
            refill(bucket, now);
            bucket.lastAccessNanos = now;
            if (bucket.tokens + 1e-9 >= 1) {
                bucket.tokens -= 1;
                return ChatMessageSearchRateLimitDecision.allow();
            }
            double missingTokens = 1 - bucket.tokens;
            long retryAfterNanos = (long) Math.ceil(
                    missingTokens * NANOS_PER_SECOND
                            / tokensPerSecond);
            long retryAfterMs = Math.max(
                    1,
                    TimeUnit.NANOSECONDS.toMillis(retryAfterNanos) + 1);
            return ChatMessageSearchRateLimitDecision.reject(
                    retryAfterMs);
        } finally {
            lock.unlock();
        }
    }

    int bucketCount() {
        lock.lock();
        try {
            return buckets.size();
        } finally {
            lock.unlock();
        }
    }

    private void refill(Bucket bucket, long now) {
        long elapsed = Math.max(0, now - bucket.lastRefillNanos);
        double refill = (double) elapsed
                / NANOS_PER_SECOND
                * tokensPerSecond;
        bucket.tokens = Math.min(burst, bucket.tokens + refill);
        bucket.lastRefillNanos = now;
    }

    private void evictIdleBuckets(long now) {
        if (!evictionInitialized) {
            lastEvictionNanos = now;
            evictionInitialized = true;
            return;
        }
        if (now - lastEvictionNanos < EVICTION_INTERVAL_NANOS) {
            return;
        }
        lastEvictionNanos = now;
        Iterator<Bucket> iterator = buckets.values().iterator();
        while (iterator.hasNext()) {
            Bucket bucket = iterator.next();
            if (now - bucket.lastAccessNanos >= BUCKET_IDLE_TTL_NANOS) {
                iterator.remove();
            }
        }
    }

    private static final class Bucket {

        private double tokens;
        private long lastRefillNanos;
        private long lastAccessNanos;

        private Bucket(double tokens, long now) {
            this.tokens = tokens;
            this.lastRefillNanos = now;
            this.lastAccessNanos = now;
        }
    }
}
