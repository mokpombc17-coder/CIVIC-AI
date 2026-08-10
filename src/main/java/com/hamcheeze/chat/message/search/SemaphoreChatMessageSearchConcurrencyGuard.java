package com.hamcheeze.chat.message.search;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

import java.util.Objects;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public final class SemaphoreChatMessageSearchConcurrencyGuard
        implements ChatMessageSearchConcurrencyGuard {

    private final Semaphore semaphore;
    private final AtomicInteger active = new AtomicInteger();

    public SemaphoreChatMessageSearchConcurrencyGuard(
            int maximum,
            MeterRegistry meterRegistry
    ) {
        if (maximum < 1) {
            throw new IllegalArgumentException(
                    "maximum concurrent searches must be positive");
        }
        this.semaphore = new Semaphore(maximum, true);
        Gauge.builder(
                        "chat.message.search.concurrent",
                        active,
                        AtomicInteger::get)
                .register(Objects.requireNonNull(
                        meterRegistry,
                        "meterRegistry"));
    }

    @Override
    public Permit tryAcquire() {
        if (!semaphore.tryAcquire()) {
            return RejectedPermit.INSTANCE;
        }
        active.incrementAndGet();
        return new AcquiredPermit();
    }

    int activeSearches() {
        return active.get();
    }

    private final class AcquiredPermit implements Permit {

        private final AtomicBoolean closed = new AtomicBoolean();

        @Override
        public boolean acquired() {
            return true;
        }

        @Override
        public void close() {
            if (closed.compareAndSet(false, true)) {
                active.decrementAndGet();
                semaphore.release();
            }
        }
    }

    private enum RejectedPermit implements Permit {
        INSTANCE;

        @Override
        public boolean acquired() {
            return false;
        }

        @Override
        public void close() {
        }
    }
}
