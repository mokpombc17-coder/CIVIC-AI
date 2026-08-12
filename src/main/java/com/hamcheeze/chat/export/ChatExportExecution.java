package com.hamcheeze.chat.export;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ChatExportExecution implements AutoCloseable {

    private final ChatExportJob job;
    private final ChatExportArtifact artifact;
    private final ChatExportJobStore jobStore;
    private final ChatExportTempManager tempManager;
    private final ChatExportConcurrencyGuard.Permit permit;
    private final Clock clock;
    private final ChatExportMetrics metrics;
    private final ChatExportMetrics.Attempt metricsAttempt;
    private final AtomicBoolean terminal = new AtomicBoolean();
    private final AtomicBoolean closed = new AtomicBoolean();

    public ChatExportExecution(
            ChatExportJob job,
            ChatExportArtifact artifact,
            ChatExportJobStore jobStore,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard.Permit permit,
            Clock clock,
            ChatExportMetrics metrics,
            ChatExportMetrics.Attempt metricsAttempt
    ) {
        this.job = Objects.requireNonNull(job, "job");
        this.artifact = Objects.requireNonNull(artifact, "artifact");
        this.jobStore = Objects.requireNonNull(jobStore, "jobStore");
        this.tempManager = Objects.requireNonNull(tempManager, "tempManager");
        this.permit = Objects.requireNonNull(permit, "permit");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
        this.metricsAttempt = Objects.requireNonNull(
                metricsAttempt,
                "metricsAttempt");
    }

    public ChatExportJob job() {
        return job;
    }

    public ChatExportArtifact artifact() {
        return artifact;
    }

    public boolean markSucceeded() {
        Instant completedAt = clock.instant();
        ChatExportCompletion completion = new ChatExportCompletion(
                completedAt,
                completedAt,
                artifact.eventCount(),
                artifact.createdCount(),
                artifact.updatedCount(),
                artifact.deletedCount(),
                artifact.sizeBytes(),
                artifact.sha256());
        boolean updated = jobStore.markSucceeded(
                job.exportId(),
                completion);
        if (updated) {
            terminal.set(true);
            metrics.succeeded(metricsAttempt, artifact);
        }
        return updated;
    }

    public void markFailedBestEffort(ChatExportFailureCode failureCode) {
        if (terminal.compareAndSet(false, true)) {
            if (failureCode == ChatExportFailureCode.DELIVERY_FAILED) {
                metrics.deliveryFailed(job.mode());
            }
            metrics.failed(metricsAttempt, failureCode.name());
            try {
                jobStore.markFailed(
                        job.exportId(),
                        failureCode,
                        clock.instant());
            } catch (RuntimeException ignored) {
                // Delivery outcome must not be replaced by metadata failure.
            }
        }
    }

    @Override
    public void close() {
        if (closed.compareAndSet(false, true)) {
            if (!terminal.get()) {
                metrics.failed(metricsAttempt, "ABANDONED");
            }
            tempManager.cleanupBestEffort(artifact.workspace());
            permit.close();
        }
    }
}
