package com.hamcheeze.chat.export;

import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public final class ResearchChatExportService {

    private final ResearchChatExportJobStore jobStore;
    private final ResearchChatExportSnapshotReader snapshotReader;
    private final ResearchChatExportArtifactGenerator artifactGenerator;
    private final ChatExportTempManager tempManager;
    private final ChatExportConcurrencyGuard concurrencyGuard;
    private final ChatExportProperties properties;
    private final Clock clock;
    private final ResearchChatExportMetrics metrics;

    public ResearchChatExportService(
            ResearchChatExportJobStore jobStore,
            ResearchChatExportSnapshotReader snapshotReader,
            ResearchChatExportArtifactGenerator artifactGenerator,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard concurrencyGuard,
            ChatExportProperties properties,
            Clock clock,
            ResearchChatExportMetrics metrics
    ) {
        this.jobStore = Objects.requireNonNull(jobStore, "jobStore");
        this.snapshotReader = Objects.requireNonNull(
                snapshotReader,
                "snapshotReader");
        this.artifactGenerator = Objects.requireNonNull(
                artifactGenerator,
                "artifactGenerator");
        this.tempManager = Objects.requireNonNull(tempManager, "tempManager");
        this.concurrencyGuard = Objects.requireNonNull(
                concurrencyGuard,
                "concurrencyGuard");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
    }

    public ResearchChatExportExecution prepare(
            String researcherId,
            String roomId
    ) {
        requireNonBlank(researcherId, "researcherId");
        requireNonBlank(roomId, "roomId");
        ResearchChatExportMetrics.Attempt attempt = metrics.start();
        ChatExportConcurrencyGuard.Permit permit =
                concurrencyGuard.tryAcquire();
        if (permit == null) {
            metrics.failed(attempt, "CAPACITY");
            throw failure(ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE, true,
                    "Chat export capacity is currently unavailable");
        }

        ResearchChatExportJob job = null;
        ResearchChatExportTempWorkspace workspace = null;
        try {
            Instant capturedAt = clock.instant();
            ResearchChatExportSnapshot snapshot = snapshotReader.findStable(
                            roomId,
                            capturedAt,
                            properties.getSnapshotMaxAttempts())
                    .orElseThrow(() -> failure(
                            ChatExportErrorCode.ROOM_NOT_FOUND,
                            HttpStatus.NOT_FOUND,
                            false,
                            "Room was not found"));
            if (snapshot.capturedChangeSequence() < 0) {
                throw failure(
                        ChatExportErrorCode.CHAT_EXPORT_LEDGER_INCONSISTENT,
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        false,
                        "Research export ledger is inconsistent");
            }
            String exportId = UUID.randomUUID().toString();
            job = ResearchChatExportJob.running(
                    exportId,
                    roomId,
                    snapshot.capturedChangeSequence(),
                    researcherId,
                    capturedAt);
            try {
                jobStore.insertRunning(job);
            } catch (DuplicateKeyException exception) {
                throw failure(ChatExportErrorCode.CHAT_EXPORT_ALREADY_RUNNING,
                        HttpStatus.CONFLICT, false,
                        "A research export is already running for the Room");
            }
            if (snapshot.capturedChangeSequence()
                    > properties.getMaxEventsPerExport()) {
                throw failure(ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE,
                        HttpStatus.PAYLOAD_TOO_LARGE, false,
                        "Research export event count limit exceeded");
            }
            workspace = tempManager.createResearch(exportId);
            ResearchChatExportArtifact artifact = artifactGenerator.generate(
                    job,
                    snapshot,
                    workspace);
            return new ResearchChatExportExecution(
                    job,
                    artifact,
                    jobStore,
                    tempManager,
                    permit,
                    clock,
                    metrics,
                    attempt);
        } catch (ChatExportSnapshotUnstableException exception) {
            failAndCleanup(job, workspace,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE, permit);
            metrics.failed(attempt,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE.name());
            throw new ChatExportException(
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    true,
                    "Research export snapshot is temporarily unavailable",
                    exception);
        } catch (ChatExportException exception) {
            failAndCleanup(job, workspace, exception.code(), permit);
            metrics.failed(attempt, exception.code().name());
            throw exception;
        } catch (IOException | DataAccessException exception) {
            failAndCleanup(job, workspace,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE, permit);
            metrics.failed(attempt,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE.name());
            throw new ChatExportException(
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    true,
                    "Research export generation is unavailable",
                    exception);
        } catch (RuntimeException exception) {
            failAndCleanup(job, workspace,
                    ChatExportErrorCode.INTERNAL_ERROR, permit);
            metrics.failed(attempt, ChatExportErrorCode.INTERNAL_ERROR.name());
            throw exception;
        }
    }

    private void failAndCleanup(
            ResearchChatExportJob job,
            ResearchChatExportTempWorkspace workspace,
            ChatExportErrorCode errorCode,
            ChatExportConcurrencyGuard.Permit permit
    ) {
        try {
            if (job != null) {
                try {
                    jobStore.markFailed(job.exportId(),
                            failureCode(errorCode), clock.instant());
                } catch (RuntimeException ignored) {
                    // Cleanup and permit release still have to run.
                }
            }
        } finally {
            try {
                if (workspace != null) {
                    try {
                        tempManager.cleanupResearchBestEffort(workspace);
                    } catch (RuntimeException ignored) {
                        // Permit release still has to run.
                    }
                }
            } finally {
                permit.close();
            }
        }
    }

    private ChatExportFailureCode failureCode(ChatExportErrorCode code) {
        return switch (code) {
            case CHAT_EXPORT_LEDGER_INCONSISTENT ->
                    ChatExportFailureCode.LEDGER_INCONSISTENT;
            case CHAT_EXPORT_TOO_LARGE -> ChatExportFailureCode.TOO_LARGE;
            default -> ChatExportFailureCode.GENERATION_FAILED;
        };
    }

    private static ChatExportException failure(
            ChatExportErrorCode code,
            HttpStatus status,
            boolean retryable,
            String detail
    ) {
        return new ChatExportException(code, status, retryable, detail);
    }

    private static void requireNonBlank(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
    }
}
