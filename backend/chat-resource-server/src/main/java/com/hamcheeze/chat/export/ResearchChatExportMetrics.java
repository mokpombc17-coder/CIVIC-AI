package com.hamcheeze.chat.export;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public final class ResearchChatExportMetrics {

    private final MeterRegistry registry;
    private final AtomicInteger running = new AtomicInteger();

    public ResearchChatExportMetrics(MeterRegistry registry) {
        this.registry = Objects.requireNonNull(registry, "registry");
        bestEffort(() -> Gauge.builder(
                        "chat.research.export.running",
                        running,
                        AtomicInteger::get)
                .register(registry));
    }

    public Attempt start() {
        running.incrementAndGet();
        bestEffort(() -> registry.counter(
                "chat.research.export.requests").increment());
        return new Attempt(System.nanoTime());
    }

    public void succeeded(
            Attempt attempt,
            ResearchChatExportArtifact artifact
    ) {
        if (!attempt.finish()) {
            return;
        }
        running.decrementAndGet();
        bestEffort(() -> {
            duration(attempt, "succeeded");
            summary("chat.research.export.messages")
                    .record(artifact.messageCount());
            summary("chat.research.export.changes")
                    .record(artifact.changeCount());
            summary("chat.research.export.artifact.bytes")
                    .record(artifact.sizeBytes());
        });
    }

    public void failed(Attempt attempt, String failureKind) {
        if (!attempt.finish()) {
            return;
        }
        running.decrementAndGet();
        bestEffort(() -> {
            duration(attempt, "failed");
            Counter.builder("chat.research.export.failures")
                    .tag("failure_kind", failureKind)
                    .register(registry)
                    .increment();
        });
    }

    public void deliveryFailed() {
        bestEffort(() -> registry.counter(
                "chat.research.export.delivery.failures").increment());
    }

    private DistributionSummary summary(String name) {
        return DistributionSummary.builder(name).register(registry);
    }

    private void duration(Attempt attempt, String outcome) {
        Timer.builder("chat.research.export.duration")
                .tag("outcome", outcome)
                .register(registry)
                .record(System.nanoTime() - attempt.startedNanos,
                        TimeUnit.NANOSECONDS);
    }

    private static void bestEffort(Runnable operation) {
        try {
            operation.run();
        } catch (RuntimeException ignored) {
            // Export correctness must not depend on metric availability.
        }
    }

    public static final class Attempt {
        private final long startedNanos;
        private final AtomicBoolean finished = new AtomicBoolean();

        private Attempt(long startedNanos) {
            this.startedNanos = startedNanos;
        }

        private boolean finish() {
            return finished.compareAndSet(false, true);
        }
    }
}
