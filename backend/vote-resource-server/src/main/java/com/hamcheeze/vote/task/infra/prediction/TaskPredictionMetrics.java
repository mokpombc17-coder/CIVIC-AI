package com.hamcheeze.vote.task.infra.prediction;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
public class TaskPredictionMetrics {

    private final Counter disabledRejection;
    private final Counter claimSuccess;
    private final Counter workerRejected;
    private final Counter predictionSuccess;
    private final Counter retryableFailure;
    private final Counter terminalFailure;
    private final Counter leaseExpiration;
    private final Counter deadlineExpiration;
    private final Counter staleCompletion;
    private final Counter lateResponse;
    private final Counter fingerprintMismatch;

    public TaskPredictionMetrics(
            MeterRegistry registry,
            TaskPredictionStatusQuery statusQuery,
            @Qualifier("taskPredictionExecutor")
            ObjectProvider<ThreadPoolTaskExecutor> executorProvider
    ) {
        Objects.requireNonNull(registry, "registry");
        disabledRejection = registry.counter(
                "vote.task.prediction.request.disabled.rejected");
        claimSuccess = registry.counter(
                "vote.task.prediction.claim.success");
        workerRejected = registry.counter(
                "vote.task.prediction.worker.task.rejected");
        predictionSuccess = registry.counter(
                "vote.task.prediction.success");
        retryableFailure = registry.counter(
                "vote.task.prediction.failure.retryable");
        terminalFailure = registry.counter(
                "vote.task.prediction.failure.terminal");
        leaseExpiration = registry.counter(
                "vote.task.prediction.lease.expiration");
        deadlineExpiration = registry.counter(
                "vote.task.prediction.deadline.expiration");
        staleCompletion = registry.counter(
                "vote.task.prediction.completion.stale.ignored");
        lateResponse = registry.counter(
                "vote.task.prediction.response.late.ignored");
        fingerprintMismatch = registry.counter(
                "vote.task.prediction.input.fingerprint.mismatch");

        gauge(registry, "vote.task.prediction.pending", statusQuery,
                snapshot -> snapshot.pendingCount());
        gauge(registry, "vote.task.prediction.processing", statusQuery,
                snapshot -> snapshot.processingCount());
        gauge(registry, "vote.task.prediction.processing.stale", statusQuery,
                snapshot -> snapshot.staleProcessingCount());
        gauge(registry, "vote.task.prediction.retry.wait", statusQuery,
                snapshot -> snapshot.retryWaitCount());
        gauge(registry, "vote.task.prediction.failed.terminal", statusQuery,
                snapshot -> snapshot.terminalFailedCount());
        gauge(registry, "vote.task.prediction.input.missing", statusQuery,
                snapshot -> snapshot.missingInputCount());
        gauge(registry, "vote.task.prediction.oldest.pending.age.seconds",
                statusQuery, snapshot -> snapshot.oldestPendingAgeSeconds());
        gauge(registry, "vote.task.prediction.oldest.processing.age.seconds",
                statusQuery, snapshot -> snapshot.oldestProcessingAgeSeconds());
        Gauge.builder("vote.task.prediction.worker.active", executorProvider,
                        provider -> executor(provider) == null ? 0
                                : executor(provider).getActiveCount())
                .register(registry);
        Gauge.builder("vote.task.prediction.worker.queue.size", executorProvider,
                        provider -> executor(provider) == null ? 0
                                : executor(provider).getThreadPoolExecutor()
                                .getQueue().size())
                .register(registry);
    }

    private static void gauge(
            MeterRegistry registry,
            String name,
            TaskPredictionStatusQuery query,
            java.util.function.ToDoubleFunction<
                    TaskPredictionStatusQuery.Snapshot> value
    ) {
        Gauge.builder(name, query, source -> value.applyAsDouble(
                source.snapshot())).register(registry);
    }

    private static ThreadPoolTaskExecutor executor(
            ObjectProvider<ThreadPoolTaskExecutor> provider
    ) {
        return provider.getIfAvailable();
    }

    public void disabledRejected() { disabledRejection.increment(); }
    public void claimSucceeded() { claimSuccess.increment(); }
    public void workerRejected() { workerRejected.increment(); }
    public void predictionSucceeded() { predictionSuccess.increment(); }
    public void retryableFailure() { retryableFailure.increment(); }
    public void terminalFailure() { terminalFailure.increment(); }
    public void leaseExpired() { leaseExpiration.increment(); }
    public void deadlineExpired() { deadlineExpiration.increment(); }
    public void staleCompletionIgnored() { staleCompletion.increment(); }
    public void lateResponseIgnored() { lateResponse.increment(); }
    public void fingerprintMismatch() { fingerprintMismatch.increment(); }
}
