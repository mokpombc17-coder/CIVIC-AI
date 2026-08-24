package com.hamcheeze.chat.export;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ResearchChatExportExecution implements AutoCloseable {

    private final ResearchChatExportJob job;
    private final ResearchChatExportArtifact artifact;
    private final ResearchChatExportJobStore jobStore;
    private final ChatExportTempManager tempManager;
    private final ChatExportConcurrencyGuard.Permit permit;
    private final Clock clock;
    private final ResearchChatExportMetrics metrics;
    private final ResearchChatExportMetrics.Attempt metricsAttempt;
    private final AtomicBoolean terminal = new AtomicBoolean();
    private final AtomicBoolean closed = new AtomicBoolean();

    public ResearchChatExportExecution(
            ResearchChatExportJob job,
            ResearchChatExportArtifact artifact,
            ResearchChatExportJobStore jobStore,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard.Permit permit,
            Clock clock,
            ResearchChatExportMetrics metrics,
            ResearchChatExportMetrics.Attempt metricsAttempt
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

    public ResearchChatExportJob job() {
        return job;
    }

    public ResearchChatExportArtifact artifact() {
        return artifact;
    }

    public boolean markSucceeded() {
        Instant deliveredAt = clock.instant();
        ResearchChatExportCompletion completion =
                new ResearchChatExportCompletion(
                        deliveredAt,
                        deliveredAt,
                        artifact.messageCount(),
                        artifact.changeCount(),
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

    public synchronized void markFailedBestEffort(
            ChatExportFailureCode failureCode
    ) {
        if (terminal.get()) {
            return;
        }
        try {
            jobStore.markFailed(job.exportId(), failureCode, clock.instant());
            terminal.set(true);
            if (failureCode == ChatExportFailureCode.DELIVERY_FAILED) {
                metrics.deliveryFailed();
            }
            metrics.failed(metricsAttempt, failureCode.name());
        } catch (RuntimeException ignored) {
            // close() retries an unpersisted terminal transition once.
        }
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        try {
            if (!terminal.get()) {
                markFailedBestEffort(ChatExportFailureCode.DELIVERY_FAILED);
            }
        } finally {
            try {
                try {
                    tempManager.cleanupResearchBestEffort(
                            artifact.workspace());
                } catch (RuntimeException ignored) {
                    // Cleanup must not replace the delivery outcome.
                }
            } finally {
                permit.close();
            }
        }
    }
}
