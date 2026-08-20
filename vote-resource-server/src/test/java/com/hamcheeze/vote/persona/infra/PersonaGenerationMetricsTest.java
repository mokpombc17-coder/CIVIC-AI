package com.hamcheeze.vote.persona.infra;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PersonaGenerationMetricsTest {

    @Test
    void exposesBacklogLeaseFailureWorkerAndOutcomeMetrics() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        PersonaGenerationStatusQuery query =
                mock(PersonaGenerationStatusQuery.class);
        when(query.snapshot()).thenReturn(
                new PersonaGenerationStatusQuery.Snapshot(
                        2, 3, 1, 4, 5, 120, 60));
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(2);
        executor.initialize();
        @SuppressWarnings("unchecked")
        ObjectProvider<ThreadPoolTaskExecutor> provider =
                mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(executor);

        try {
            PersonaGenerationMetrics metrics =
                    new PersonaGenerationMetrics(registry, query, provider);

            assertGauge(registry, "vote.persona.generation.pending", 2);
            assertGauge(registry, "vote.persona.generation.processing", 3);
            assertGauge(registry,
                    "vote.persona.generation.processing.stale", 1);
            assertGauge(registry, "vote.persona.generation.retry.wait", 4);
            assertGauge(registry,
                    "vote.persona.generation.failed.terminal", 5);
            assertGauge(registry,
                    "vote.persona.generation.oldest.pending.age.seconds", 120);
            assertGauge(registry,
                    "vote.persona.generation.oldest.processing.age.seconds", 60);
            assertGauge(registry,
                    "vote.persona.generation.worker.active", 0);
            assertGauge(registry,
                    "vote.persona.generation.worker.queue.size", 0);

            metrics.claimSucceeded();
            metrics.workerRejected();
            metrics.generationSucceeded();
            metrics.retryableFailure();
            metrics.terminalFailure();
            metrics.leaseExpired(2);
            metrics.staleCompletionIgnored();
            metrics.manualRetryScheduled();
            metrics.manualRetryIdempotent();

            assertCounter(registry,
                    "vote.persona.generation.claim.success", 1);
            assertCounter(registry,
                    "vote.persona.generation.worker.task.rejected", 1);
            assertCounter(registry,
                    "vote.persona.generation.success", 1);
            assertCounter(registry,
                    "vote.persona.generation.failure.retryable", 1);
            assertCounter(registry,
                    "vote.persona.generation.failure.terminal", 1);
            assertCounter(registry,
                    "vote.persona.generation.lease.expiration", 2);
            assertCounter(registry,
                    "vote.persona.generation.completion.stale.ignored", 1);
            assertCounter(registry,
                    "vote.persona.generation.manual.retry.scheduled", 1);
            assertCounter(registry,
                    "vote.persona.generation.manual.retry.idempotent", 1);
        } finally {
            executor.shutdown();
            registry.close();
        }
    }

    private static void assertGauge(
            SimpleMeterRegistry registry,
            String name,
            double expected
    ) {
        assertThat(registry.get(name).gauge().value()).isEqualTo(expected);
    }

    private static void assertCounter(
            SimpleMeterRegistry registry,
            String name,
            double expected
    ) {
        assertThat(registry.get(name).counter().count()).isEqualTo(expected);
    }
}
