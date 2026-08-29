package com.hamcheeze.chat.export;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;

final class DefaultAdminRoomConversationExportExecution
        implements AdminRoomConversationExportExecution {

    private final AdminRoomConversationExportJob job;
    private final AdminRoomConversationExportArtifact artifact;
    private final AdminRoomConversationExportJobStore jobStore;
    private final ChatExportTempManager tempManager;
    private final ChatExportConcurrencyGuard.Permit permit;
    private final Clock clock;
    private final AtomicBoolean terminal = new AtomicBoolean();
    private final AtomicBoolean closed = new AtomicBoolean();

    DefaultAdminRoomConversationExportExecution(
            AdminRoomConversationExportJob job,
            AdminRoomConversationExportArtifact artifact,
            AdminRoomConversationExportJobStore jobStore,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard.Permit permit,
            Clock clock
    ) {
        this.job = Objects.requireNonNull(job, "job");
        this.artifact = Objects.requireNonNull(artifact, "artifact");
        this.jobStore = Objects.requireNonNull(jobStore, "jobStore");
        this.tempManager = Objects.requireNonNull(tempManager, "tempManager");
        this.permit = Objects.requireNonNull(permit, "permit");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Override
    public String exportId() {
        return job.exportId();
    }

    @Override
    public Path artifactPath() {
        return artifact.path();
    }

    @Override
    public long artifactSizeBytes() {
        return artifact.sizeBytes();
    }

    @Override
    public String artifactSha256() {
        return artifact.sha256();
    }

    @Override
    public boolean markSucceeded() {
        Instant deliveredAt = clock.instant();
        boolean updated = jobStore.markSucceeded(
                job.exportId(),
                new AdminRoomConversationExportCompletion(
                        deliveredAt,
                        deliveredAt,
                        artifact.messageCount(),
                        artifact.changeCount(),
                        artifact.createdCount(),
                        artifact.updatedCount(),
                        artifact.deletedCount(),
                        artifact.sizeBytes(),
                        artifact.sha256()));
        if (updated) {
            terminal.set(true);
        }
        return updated;
    }

    @Override
    public synchronized void markFailedBestEffort(
            ChatExportFailureCode failureCode
    ) {
        Objects.requireNonNull(failureCode, "failureCode");
        if (terminal.get()) {
            return;
        }
        try {
            if (jobStore.markFailed(
                    job.exportId(), failureCode, clock.instant())) {
                terminal.set(true);
            }
        } catch (RuntimeException ignored) {
            // close() retries an unpersisted transition once.
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
                tempManager.cleanupAdminConversationBestEffort(
                        artifact.workspace());
            } catch (RuntimeException ignored) {
                // Cleanup must not replace the delivery outcome.
            } finally {
                permit.close();
            }
        }
    }
}
