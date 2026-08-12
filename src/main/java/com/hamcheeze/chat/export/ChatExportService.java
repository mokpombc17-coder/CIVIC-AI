package com.hamcheeze.chat.export;

import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public final class ChatExportService {

    private final ChatExportJobStore jobStore;
    private final ChatMessageAuditReader auditReader;
    private final ChatExportSnapshotReader snapshotReader;
    private final ChatExportArtifactGenerator artifactGenerator;
    private final ChatExportTempManager tempManager;
    private final ChatExportConcurrencyGuard concurrencyGuard;
    private final ChatExportProperties properties;
    private final Clock clock;
    private final ChatExportMetrics metrics;

    public ChatExportService(
            ChatExportJobStore jobStore,
            ChatMessageAuditReader auditReader,
            ChatExportSnapshotReader snapshotReader,
            ChatExportArtifactGenerator artifactGenerator,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard concurrencyGuard,
            ChatExportProperties properties,
            Clock clock,
            ChatExportMetrics metrics
    ) {
        this.jobStore = Objects.requireNonNull(jobStore, "jobStore");
        this.auditReader = Objects.requireNonNull(auditReader, "auditReader");
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

    public ChatExportExecution prepare(
            String adminId,
            String roomId,
            ChatExportMode mode
    ) {
        requireNonBlank(adminId, "adminId");
        requireNonBlank(roomId, "roomId");
        Objects.requireNonNull(mode, "mode");
        ChatExportMetrics.Attempt metricsAttempt = metrics.start(mode);

        ChatExportConcurrencyGuard.Permit permit =
                concurrencyGuard.tryAcquire();
        if (permit == null) {
            metrics.failed(metricsAttempt, "CAPACITY");
            throw failure(
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    true,
                    "Chat export capacity is currently unavailable");
        }

        ChatExportJob job = null;
        ChatExportTempWorkspace workspace = null;
        try {
            Instant capturedAt = clock.instant();
            ChatExportSnapshot snapshot = snapshotReader.findStable(
                            roomId,
                            capturedAt,
                            properties.getSnapshotMaxAttempts())
                    .orElseThrow(() -> failure(
                            ChatExportErrorCode.ROOM_NOT_FOUND,
                            HttpStatus.NOT_FOUND,
                            false,
                            "Room was not found"));

            ChatExportJob base = mode == ChatExportMode.INCREMENTAL
                    ? jobStore.findLatestSucceeded(roomId, adminId)
                            .orElseThrow(() -> failure(
                                    ChatExportErrorCode
                                            .CHAT_EXPORT_BASE_NOT_FOUND,
                                    HttpStatus.CONFLICT,
                                    false,
                                    "A successful base export is required"))
                    : null;
            long fromSequence = base == null
                    ? 0
                    : base.toChangeSequenceInclusive();
            long watermark = auditReader.currentRoomChangeSequence(roomId);
            if (watermark < fromSequence) {
                throw failure(
                        ChatExportErrorCode
                                .CHAT_EXPORT_LEDGER_INCONSISTENT,
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        false,
                        "Chat export ledger is inconsistent");
            }

            String exportId = UUID.randomUUID().toString();
            job = ChatExportJob.running(
                    exportId,
                    roomId,
                    mode,
                    base == null ? null : base.exportId(),
                    fromSequence,
                    watermark,
                    adminId,
                    capturedAt);
            try {
                jobStore.insertRunning(job);
            } catch (DuplicateKeyException exception) {
                throw failure(
                        ChatExportErrorCode.CHAT_EXPORT_ALREADY_RUNNING,
                        HttpStatus.CONFLICT,
                        false,
                        "An export for this Room is already running");
            }

            long expectedEventCount = Math.subtractExact(
                    watermark,
                    fromSequence);
            if (expectedEventCount > properties.getMaxEventsPerExport()) {
                throw failure(
                        ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE,
                        HttpStatus.PAYLOAD_TOO_LARGE,
                        false,
                        "Chat export event range exceeds the limit");
            }

            workspace = tempManager.create(exportId, mode);
            ChatExportArtifact artifact = artifactGenerator.generate(
                    job,
                    snapshot,
                    workspace);
            return new ChatExportExecution(
                    job,
                    artifact,
                    jobStore,
                    tempManager,
                    permit,
                    clock,
                    metrics,
                    metricsAttempt);
        } catch (ChatExportSnapshotUnstableException exception) {
            failAndCleanup(
                    job,
                    workspace,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    permit);
            metrics.failed(
                    metricsAttempt,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE.name());
            throw new ChatExportException(
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    true,
                    "Chat export snapshot is temporarily unavailable",
                    exception);
        } catch (ChatExportException exception) {
            failAndCleanup(job, workspace, exception.code(), permit);
            metrics.failed(metricsAttempt, exception.code().name());
            throw exception;
        } catch (IOException exception) {
            failAndCleanup(
                    job,
                    workspace,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    permit);
            metrics.failed(
                    metricsAttempt,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE.name());
            throw failure(
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    true,
                    "Chat export generation is unavailable");
        } catch (DataAccessException exception) {
            failAndCleanup(
                    job,
                    workspace,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    permit);
            metrics.failed(
                    metricsAttempt,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE.name());
            throw new ChatExportException(
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    true,
                    "Chat export storage is unavailable",
                    exception);
        } catch (RuntimeException exception) {
            failAndCleanup(
                    job,
                    workspace,
                    ChatExportErrorCode.INTERNAL_ERROR,
                    permit);
            metrics.failed(
                    metricsAttempt,
                    ChatExportErrorCode.INTERNAL_ERROR.name());
            throw exception;
        }
    }

    private void failAndCleanup(
            ChatExportJob job,
            ChatExportTempWorkspace workspace,
            ChatExportErrorCode errorCode,
            ChatExportConcurrencyGuard.Permit permit
    ) {
        try {
            if (job != null) {
                try {
                    jobStore.markFailed(
                            job.exportId(),
                            failureCode(errorCode),
                            clock.instant());
                } catch (RuntimeException ignored) {
                    // Preserve the original generation failure.
                }
            }
        } finally {
            try {
                if (workspace != null) {
                    try {
                        tempManager.cleanupBestEffort(workspace);
                    } catch (RuntimeException ignored) {
                        // Preserve the original generation failure.
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
