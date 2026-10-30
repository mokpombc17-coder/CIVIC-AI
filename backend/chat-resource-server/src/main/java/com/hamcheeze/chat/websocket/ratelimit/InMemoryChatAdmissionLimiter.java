package com.hamcheeze.chat.websocket.ratelimit;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.websocket.config.ChatAdmissionProperties;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

@Component
public final class InMemoryChatAdmissionLimiter
        implements ChatAdmissionLimiter {

    private static final Logger log =
            LoggerFactory.getLogger(InMemoryChatAdmissionLimiter.class);

    private final ReentrantLock lock = new ReentrantLock();
    private final Map<String, UserTokenBucketState> userBuckets = new HashMap<>();
    private final Map<Long, GlobalEntry> globalEntries = new HashMap<>();
    private final ChatAdmissionProperties.User userPolicy;
    private final ChatAdmissionProperties.GlobalSource globalPolicy;
    private final TimeSource timeSource;
    private final Counter userLimitedCounter;
    private final Counter globalLimitedCounter;
    private final Counter admittedCounter;
    private long nextEntryId;

    @Autowired
    public InMemoryChatAdmissionLimiter(
            ChatAdmissionProperties properties,
            MeterRegistry meterRegistry
    ) {
        this(properties, meterRegistry, System::nanoTime);
    }

    InMemoryChatAdmissionLimiter(
            ChatAdmissionProperties properties,
            MeterRegistry meterRegistry,
            TimeSource timeSource
    ) {
        this.userPolicy = properties.getUser();
        this.globalPolicy = properties.getGlobalSource();
        this.timeSource = timeSource;
        this.userLimitedCounter =
                meterRegistry.counter("chat.rate_limited.user");
        this.globalLimitedCounter =
                meterRegistry.counter("chat.rate_limited.global");
        this.admittedCounter =
                meterRegistry.counter("chat.command.admitted");
    }

    @Override
    public AdmissionReservation tryReserve(String userId, int tokenCost) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("userId is required");
        }
        if (tokenCost < 1 || tokenCost > userPolicy.getCapacity()) {
            throw new IllegalArgumentException("invalid tokenCost");
        }

        long now = timeSource.nanoTime();
        AdmissionOutcome deniedOutcome = null;
        long retryAfterMs = 0;
        Reservation granted = null;

        lock.lock();
        try {
            evictIdleUserBucketsLocked(now);
            UserTokenBucketState bucket = userBuckets.computeIfAbsent(
                    userId,
                    ignored -> new UserTokenBucketState(
                            userPolicy.getCapacity(), now));
            refill(bucket, now);
            bucket.lastAccessNanos = now;
            cleanupCommittedEntries(now);

            double effectiveAvailable =
                    bucket.refilledBalance - bucket.pendingTokenCost;
            if (effectiveAvailable + 1e-9 < tokenCost) {
                deniedOutcome = AdmissionOutcome.USER_RATE_LIMITED;
                retryAfterMs = userRetryAfterMs(
                        tokenCost - effectiveAvailable);
            } else {
                long globalRetry = globalRetryAfterMs(now);
                if (globalRetry > 0) {
                    deniedOutcome = AdmissionOutcome.GLOBAL_SOURCE_LIMITED;
                    retryAfterMs = globalRetry;
                } else {
                    bucket.pendingTokenCost += tokenCost;
                    long entryId = ++nextEntryId;
                    globalEntries.put(
                            entryId,
                            new GlobalEntry(entryId, now, EntryState.PENDING));
                    granted = new Reservation(
                            userId, tokenCost, entryId,
                            AdmissionOutcome.GRANTED, 0);
                }
            }
        } finally {
            lock.unlock();
        }

        if (granted != null) {
            return granted;
        }
        if (deniedOutcome == AdmissionOutcome.USER_RATE_LIMITED) {
            BestEffortMetricRecorder.increment(
                    "chat.rate_limited.user",
                    userLimitedCounter);
        } else {
            BestEffortMetricRecorder.increment(
                    "chat.rate_limited.global",
                    globalLimitedCounter);
        }
        log.info(
                "Chat admission rejected: userId={}, outcome={}, retryAfterMs={}",
                userId, deniedOutcome, retryAfterMs);
        return new DeniedReservation(deniedOutcome, retryAfterMs);
    }

    int evictIdleUserBuckets() {
        lock.lock();
        try {
            return evictIdleUserBucketsLocked(timeSource.nanoTime());
        } finally {
            lock.unlock();
        }
    }

    UserBucketSnapshot userBucketSnapshot(String userId) {
        lock.lock();
        try {
            UserTokenBucketState state = userBuckets.get(userId);
            if (state == null) {
                return null;
            }
            return new UserBucketSnapshot(
                    state.refilledBalance,
                    state.pendingTokenCost,
                    state.refilledBalance - state.pendingTokenCost);
        } finally {
            lock.unlock();
        }
    }

    int globalEntryCount() {
        lock.lock();
        try {
            return globalEntries.size();
        } finally {
            lock.unlock();
        }
    }

    private int evictIdleUserBucketsLocked(long now) {
        if (userPolicy.getBucketIdleTtlMs() == 0) {
            return 0;
        }
        int removed = 0;
        long ttlNanos = TimeUnit.MILLISECONDS.toNanos(
                userPolicy.getBucketIdleTtlMs());
        Iterator<Map.Entry<String, UserTokenBucketState>> iterator =
                userBuckets.entrySet().iterator();
        while (iterator.hasNext()) {
            UserTokenBucketState state = iterator.next().getValue();
            if (state.pendingTokenCost == 0
                    && now - state.lastAccessNanos >= ttlNanos) {
                iterator.remove();
                removed++;
            }
        }
        return removed;
    }

    private void refill(UserTokenBucketState bucket, long now) {
        long elapsed = Math.max(0, now - bucket.lastRefillNanos);
        double refill = (double) elapsed
                / TimeUnit.MILLISECONDS.toNanos(userPolicy.getRefillPeriodMs())
                * userPolicy.getRefillTokens();
        bucket.refilledBalance = Math.min(
                userPolicy.getCapacity(), bucket.refilledBalance + refill);
        bucket.lastRefillNanos = now;
    }

    private long userRetryAfterMs(double neededTokens) {
        double periods = neededTokens / userPolicy.getRefillTokens();
        return Math.max(
                1,
                (long) Math.ceil(periods * userPolicy.getRefillPeriodMs()));
    }

    private void cleanupCommittedEntries(long now) {
        long sustainedNanos = TimeUnit.MILLISECONDS.toNanos(
                globalPolicy.getSustainedWindowMs());
        globalEntries.values().removeIf(entry ->
                entry.state == EntryState.COMMITTED
                        && now - entry.reservedAtNanos >= sustainedNanos);
    }

    private long globalRetryAfterMs(long now) {
        long burstWait = waitForWindow(
                now,
                TimeUnit.MILLISECONDS.toNanos(globalPolicy.getBurstWindowMs()),
                globalPolicy.getBurstMaxAccepted());
        long sustainedWait = waitForWindow(
                now,
                TimeUnit.MILLISECONDS.toNanos(globalPolicy.getSustainedWindowMs()),
                globalPolicy.getSustainedMaxAccepted());
        return Math.max(burstWait, sustainedWait);
    }

    private long waitForWindow(long now, long windowNanos, int maximum) {
        List<Long> releaseTimes = new ArrayList<>();
        for (GlobalEntry entry : globalEntries.values()) {
            if (entry.state == EntryState.PENDING
                    || now - entry.reservedAtNanos < windowNanos) {
                releaseTimes.add(entry.reservedAtNanos + windowNanos);
            }
        }
        if (releaseTimes.size() < maximum) {
            return 0;
        }
        releaseTimes.sort(Long::compareTo);
        int releasesNeeded = releaseTimes.size() - maximum + 1;
        long waitNanos = Math.max(
                1, releaseTimes.get(releasesNeeded - 1) - now);
        return Math.max(1, TimeUnit.NANOSECONDS.toMillis(waitNanos) + 1);
    }

    private final class Reservation implements AdmissionReservation {

        private final String userId;
        private final int tokenCost;
        private final long globalEntryId;
        private final AdmissionOutcome outcome;
        private final long retryAfterMs;
        private ReservationState state = ReservationState.PENDING;

        private Reservation(
                String userId,
                int tokenCost,
                long globalEntryId,
                AdmissionOutcome outcome,
                long retryAfterMs
        ) {
            this.userId = userId;
            this.tokenCost = tokenCost;
            this.globalEntryId = globalEntryId;
            this.outcome = outcome;
            this.retryAfterMs = retryAfterMs;
        }

        @Override
        public AdmissionOutcome outcome() {
            return outcome;
        }

        @Override
        public long retryAfterMs() {
            return retryAfterMs;
        }

        @Override
        public void commit() {
            boolean committed = false;
            lock.lock();
            try {
                if (state == ReservationState.COMMITTED) {
                    return;
                }
                if (state == ReservationState.ROLLED_BACK) {
                    throw new IllegalStateException(
                            "Rolled back reservation cannot be committed");
                }
                UserTokenBucketState bucket = userBuckets.get(userId);
                GlobalEntry entry = globalEntries.get(globalEntryId);
                if (bucket == null || entry == null) {
                    throw new IllegalStateException("Reservation state is missing");
                }
                bucket.refilledBalance = Math.max(
                        0, bucket.refilledBalance - tokenCost);
                bucket.pendingTokenCost -= tokenCost;
                bucket.lastAccessNanos = timeSource.nanoTime();
                entry.state = EntryState.COMMITTED;
                state = ReservationState.COMMITTED;
                committed = true;
            } finally {
                lock.unlock();
            }
            if (committed) {
                BestEffortMetricRecorder.increment(
                        "chat.command.admitted",
                        admittedCounter);
            }
        }

        @Override
        public void close() {
            lock.lock();
            try {
                if (state == ReservationState.COMMITTED
                        || state == ReservationState.ROLLED_BACK) {
                    return;
                }
                UserTokenBucketState bucket = userBuckets.get(userId);
                if (bucket != null) {
                    bucket.pendingTokenCost -= tokenCost;
                    bucket.lastAccessNanos = timeSource.nanoTime();
                }
                globalEntries.remove(globalEntryId);
                state = ReservationState.ROLLED_BACK;
            } finally {
                lock.unlock();
            }
        }
    }

    private record DeniedReservation(
            AdmissionOutcome outcome,
            long retryAfterMs
    ) implements AdmissionReservation {

        @Override
        public void commit() {
            throw new IllegalStateException(
                    "Denied reservation cannot be committed");
        }

        @Override
        public void close() {
        }
    }

    record UserBucketSnapshot(
            double refilledBalance,
            int pendingTokenCost,
            double effectiveAvailable
    ) {
    }

    private static final class UserTokenBucketState {
        private double refilledBalance;
        private int pendingTokenCost;
        private long lastRefillNanos;
        private long lastAccessNanos;

        private UserTokenBucketState(double capacity, long now) {
            this.refilledBalance = capacity;
            this.lastRefillNanos = now;
            this.lastAccessNanos = now;
        }
    }

    private static final class GlobalEntry {
        private final long id;
        private final long reservedAtNanos;
        private EntryState state;

        private GlobalEntry(long id, long reservedAtNanos, EntryState state) {
            this.id = id;
            this.reservedAtNanos = reservedAtNanos;
            this.state = state;
        }
    }

    private enum EntryState {
        PENDING,
        COMMITTED
    }
}
