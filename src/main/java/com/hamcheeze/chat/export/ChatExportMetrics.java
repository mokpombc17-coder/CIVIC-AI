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

public final class ChatExportMetrics {

    private final MeterRegistry registry;
    private final AtomicInteger running = new AtomicInteger();

    public ChatExportMetrics(MeterRegistry registry) {
        this.registry = Objects.requireNonNull(registry, "registry");
        Gauge.builder("chat.export.running", running, AtomicInteger::get)
                .register(registry);
    }

    public Attempt start(ChatExportMode mode) {
        registry.counter(
                        "chat.export.requests",
                        "mode",
                        mode.name())
                .increment();
        running.incrementAndGet();
        return new Attempt(mode, System.nanoTime());
    }

    public void succeeded(Attempt attempt, ChatExportArtifact artifact) {
        if (!attempt.finish()) {
            return;
        }
        running.decrementAndGet();
        recordDuration(attempt, "succeeded");
        summary("chat.export.events", attempt.mode())
                .record(artifact.eventCount());
        summary("chat.export.messages", attempt.mode())
                .record(artifact.createdCount());
        summary("chat.export.participants", attempt.mode())
                .record(artifact.participantCount());
        summary("chat.export.artifact.bytes", attempt.mode())
                .record(artifact.sizeBytes());
    }

    public void failed(Attempt attempt, String failureKind) {
        if (!attempt.finish()) {
            return;
        }
        running.decrementAndGet();
        recordDuration(attempt, "failed");
        Counter.builder("chat.export.failures")
                .tag("mode", attempt.mode().name())
                .tag("failure_kind", failureKind)
                .register(registry)
                .increment();
    }

    public void deliveryFailed(ChatExportMode mode) {
        registry.counter(
                        "chat.export.delivery.failures",
                        "mode",
                        mode.name())
                .increment();
    }

    private DistributionSummary summary(String name, ChatExportMode mode) {
        return DistributionSummary.builder(name)
                .tag("mode", mode.name())
                .register(registry);
    }

    private void recordDuration(Attempt attempt, String outcome) {
        Timer.builder("chat.export.duration")
                .tag("mode", attempt.mode().name())
                .tag("outcome", outcome)
                .register(registry)
                .record(
                        System.nanoTime() - attempt.startedNanos(),
                        TimeUnit.NANOSECONDS);
    }

    public static final class Attempt {

        private final ChatExportMode mode;
        private final long startedNanos;
        private final AtomicBoolean finished = new AtomicBoolean();

        private Attempt(ChatExportMode mode, long startedNanos) {
            this.mode = mode;
            this.startedNanos = startedNanos;
        }

        ChatExportMode mode() {
            return mode;
        }

        long startedNanos() {
            return startedNanos;
        }

        boolean finish() {
            return finished.compareAndSet(false, true);
        }
    }
}
