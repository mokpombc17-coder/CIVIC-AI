package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;

public final class ChatMessageOutboxMetricsSampler {

    private static final Logger log = LoggerFactory.getLogger(
            ChatMessageOutboxMetricsSampler.class);

    private final ChatMessageOutboxMonitor monitor;
    private final AtomicLong pending = new AtomicLong();
    private final AtomicLong oldestPendingAgeSeconds = new AtomicLong();
    private final AtomicLong unsupported = new AtomicLong();
    private final Counter sampleFailureCounter;

    public ChatMessageOutboxMetricsSampler(
            ChatMessageOutboxMonitor monitor,
            MeterRegistry meterRegistry
    ) {
        this.monitor = Objects.requireNonNull(monitor, "monitor");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.sampleFailureCounter = meterRegistry.counter(
                "chat.outbox.monitor.sample.failures");
        Gauge.builder(
                        "chat.outbox.pending",
                        pending,
                        AtomicLong::get)
                .register(meterRegistry);
        Gauge.builder(
                        "chat.outbox.oldest.pending.age.seconds",
                        oldestPendingAgeSeconds,
                        AtomicLong::get)
                .register(meterRegistry);
        Gauge.builder(
                        "chat.outbox.unsupported",
                        unsupported,
                        AtomicLong::get)
                .register(meterRegistry);
    }

    public void sample(Instant now) {
        Objects.requireNonNull(now, "now");
        try {
            ChatMessageOutboxBacklogSnapshot snapshot =
                    monitor.sample();
            pending.set(snapshot.pendingCount());
            unsupported.set(snapshot.unsupportedCount());
            Instant oldest = snapshot.oldestOccurredAt();
            long ageSeconds = oldest == null
                    ? 0
                    : Math.max(
                            0,
                            Duration.between(oldest, now).toSeconds());
            oldestPendingAgeSeconds.set(ageSeconds);
            if (snapshot.unsupportedCount() > 0) {
                log.warn(
                        "Unsupported chat outbox documents are pending: count={}",
                        snapshot.unsupportedCount());
            }
        } catch (RuntimeException exception) {
            BestEffortMetricRecorder.increment(
                    "chat.outbox.monitor.sample.failures",
                    sampleFailureCounter);
            log.warn(
                    "Failed to sample chat outbox backlog metrics; "
                            + "keeping the last successful values",
                    exception);
        }
    }

    long pending() {
        return pending.get();
    }

    long oldestPendingAgeSeconds() {
        return oldestPendingAgeSeconds.get();
    }

    long unsupported() {
        return unsupported.get();
    }
}
