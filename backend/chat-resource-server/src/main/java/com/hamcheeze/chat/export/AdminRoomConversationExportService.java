package com.hamcheeze.chat.export;

import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public final class AdminRoomConversationExportService {

    private final AdminRoomConversationExportJobStore jobStore;
    private final AdminRoomConversationExportSnapshotReader snapshotReader;
    private final AdminRoomConversationExportArtifactGenerator
            artifactGenerator;
    private final ChatExportTempManager tempManager;
    private final ChatExportConcurrencyGuard concurrencyGuard;
    private final ChatExportProperties properties;
    private final Clock clock;

    public AdminRoomConversationExportService(
            AdminRoomConversationExportJobStore jobStore,
            AdminRoomConversationExportSnapshotReader snapshotReader,
            AdminRoomConversationExportArtifactGenerator artifactGenerator,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard concurrencyGuard,
            ChatExportProperties properties,
            Clock clock
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
    }

    public AdminRoomConversationExportExecution prepare(
            String adminId,
            String roomId,
            AdminRoomConversationExportRequest request
    ) {
        requireNonBlank(adminId, "adminId");
        requireNonBlank(roomId, "roomId");
        Objects.requireNonNull(request, "request");
        Instant capturedAt = clock.instant();
        AdminRoomConversationExportRange range = request.validatedRange(
                capturedAt,
                properties.getMaxConversationExportRange());
        ChatExportConcurrencyGuard.Permit permit =
                concurrencyGuard.tryAcquire();
        if (permit == null) {
            throw failure(
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    true,
                    "Chat export capacity is currently unavailable");
        }

        AdminRoomConversationExportJob job = null;
        AdminRoomConversationExportTempWorkspace workspace = null;
        try {
            AdminRoomConversationExportSnapshot snapshot =
                    snapshotReader.findStable(
                                    roomId,
                                    range,
                                    capturedAt,
                                    properties.getSnapshotMaxAttempts())
                    .orElseThrow(() -> new ChatExportException(
                            ChatExportErrorCode.ROOM_NOT_FOUND,
                            HttpStatus.NOT_FOUND,
                            false,
                            "Room was not found"));
            String exportId = UUID.randomUUID().toString();
            job = AdminRoomConversationExportJob.running(
                    exportId,
                    roomId,
                    range,
                    snapshot.capturedChangeSequence(),
                    adminId,
                    capturedAt);
            try {
                jobStore.insertRunning(job);
            } catch (DuplicateKeyException exception) {
                throw failure(
                        ChatExportErrorCode.CHAT_EXPORT_ALREADY_RUNNING,
                        HttpStatus.CONFLICT,
                        false,
                        "An admin conversation export is already running "
                                + "for the Room");
            }
            workspace = tempManager.createAdminConversation(exportId);
            AdminRoomConversationExportArtifact artifact =
                    artifactGenerator.generate(
                            exportId,
                            snapshot,
                            workspace);
            return new DefaultAdminRoomConversationExportExecution(
                    job,
                    artifact,
                    jobStore,
                    tempManager,
                    permit,
                    clock);
        } catch (ChatExportSnapshotUnstableException exception) {
            failAndCleanup(job, workspace,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE, permit);
            throw new ChatExportException(
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    true,
                    "Admin room conversation snapshot is temporarily "
                            + "unavailable",
                    exception);
        } catch (ChatExportException exception) {
            failAndCleanup(job, workspace, exception.code(), permit);
            throw exception;
        } catch (IOException | DataAccessException exception) {
            failAndCleanup(job, workspace,
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE, permit);
            throw new ChatExportException(
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    true,
                    "Admin room conversation export generation is "
                            + "unavailable",
                    exception);
        } catch (RuntimeException exception) {
            failAndCleanup(job, workspace,
                    ChatExportErrorCode.INTERNAL_ERROR, permit);
            throw exception;
        }
    }

    private void failAndCleanup(
            AdminRoomConversationExportJob job,
            AdminRoomConversationExportTempWorkspace workspace,
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
                    // Cleanup and permit release still have to run.
                }
            }
        } finally {
            try {
                if (workspace != null) {
                    try {
                        tempManager.cleanupAdminConversationBestEffort(
                                workspace);
                    } catch (RuntimeException ignored) {
                        // Permit release still has to run.
                    }
                }
            } finally {
                permit.close();
            }
        }
    }

    private static ChatExportFailureCode failureCode(
            ChatExportErrorCode code
    ) {
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
