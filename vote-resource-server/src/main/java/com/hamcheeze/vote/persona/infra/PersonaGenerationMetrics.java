package com.hamcheeze.vote.persona.infra;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
public class PersonaGenerationMetrics {

    private final Counter claimSuccess;
    private final Counter workerRejected;
    private final Counter generationSuccess;
    private final Counter retryableFailure;
    private final Counter terminalFailure;
    private final Counter leaseExpiration;
    private final Counter staleCompletion;
    private final Counter manualRetryScheduled;
    private final Counter manualRetryIdempotent;

    public PersonaGenerationMetrics(
            MeterRegistry registry,
            PersonaGenerationStatusQuery statusQuery,
            @Qualifier("personaGenerationExecutor")
            ObjectProvider<ThreadPoolTaskExecutor> executorProvider
    ) {
        Objects.requireNonNull(statusQuery, "statusQuery");
        claimSuccess = registry.counter(
                "vote.persona.generation.claim.success");
        workerRejected = registry.counter(
                "vote.persona.generation.worker.task.rejected");
        generationSuccess = registry.counter(
                "vote.persona.generation.success");
        retryableFailure = registry.counter(
                "vote.persona.generation.failure.retryable");
        terminalFailure = registry.counter(
                "vote.persona.generation.failure.terminal");
        leaseExpiration = registry.counter(
                "vote.persona.generation.lease.expiration");
        staleCompletion = registry.counter(
                "vote.persona.generation.completion.stale.ignored");
        manualRetryScheduled = registry.counter(
                "vote.persona.generation.manual.retry.scheduled");
        manualRetryIdempotent = registry.counter(
                "vote.persona.generation.manual.retry.idempotent");

        gauge(registry, "vote.persona.generation.pending", statusQuery,
                snapshot -> snapshot.pendingCount());
        gauge(registry, "vote.persona.generation.processing", statusQuery,
                snapshot -> snapshot.processingCount());
        gauge(registry, "vote.persona.generation.processing.stale", statusQuery,
                snapshot -> snapshot.staleProcessingCount());
        gauge(registry, "vote.persona.generation.retry.wait", statusQuery,
                snapshot -> snapshot.retryWaitCount());
        gauge(registry, "vote.persona.generation.failed.terminal", statusQuery,
                snapshot -> snapshot.terminalFailedCount());
        gauge(registry, "vote.persona.generation.oldest.pending.age.seconds",
                statusQuery, snapshot -> snapshot.oldestPendingAgeSeconds());
        gauge(registry, "vote.persona.generation.oldest.processing.age.seconds",
                statusQuery, snapshot -> snapshot.oldestProcessingAgeSeconds());
        Gauge.builder("vote.persona.generation.worker.active", executorProvider,
                        provider -> executor(provider) == null ? 0
                                : executor(provider).getActiveCount())
                .register(registry);
        Gauge.builder("vote.persona.generation.worker.queue.size", executorProvider,
                        provider -> executor(provider) == null ? 0
                                : executor(provider).getThreadPoolExecutor()
                                .getQueue().size())
                .register(registry);
    }

    private static void gauge(
            MeterRegistry registry,
            String name,
            PersonaGenerationStatusQuery query,
            java.util.function.ToDoubleFunction<PersonaGenerationStatusQuery.Snapshot> value
    ) {
        Gauge.builder(name, query, source -> value.applyAsDouble(
                        source.snapshot()))
                .register(registry);
    }

    private static ThreadPoolTaskExecutor executor(
            ObjectProvider<ThreadPoolTaskExecutor> provider
    ) {
        return provider.getIfAvailable();
    }

    public void claimSucceeded() { claimSuccess.increment(); }
    public void workerRejected() { workerRejected.increment(); }
    public void generationSucceeded() { generationSuccess.increment(); }
    public void retryableFailure() { retryableFailure.increment(); }
    public void terminalFailure() { terminalFailure.increment(); }
    public void leaseExpired(int count) { leaseExpiration.increment(count); }
    public void staleCompletionIgnored() { staleCompletion.increment(); }
    public void manualRetryScheduled() { manualRetryScheduled.increment(); }
    public void manualRetryIdempotent() { manualRetryIdempotent.increment(); }
}
