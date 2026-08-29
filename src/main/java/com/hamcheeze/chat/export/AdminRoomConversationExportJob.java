package com.hamcheeze.chat.export;

import java.time.Instant;
import java.util.Objects;

public record AdminRoomConversationExportJob(
        String exportId,
        int schemaVersion,
        String roomId,
        Instant fromInclusive,
        Instant toExclusive,
        long capturedChangeSequence,
        ChatExportStatus status,
        String requestedByAdminId,
        Instant requestedAt,
        Instant startedAt,
        Instant completedAt,
        Instant deliveryCompletedAt,
        long messageCount,
        long changeCount,
        long createdCount,
        long updatedCount,
        long deletedCount,
        Long artifactSizeBytes,
        String artifactSha256,
        ChatExportFailureCode failureCode
) {

    public static final int CURRENT_SCHEMA_VERSION = 1;

    public AdminRoomConversationExportJob {
        requireNonBlank(exportId, "exportId");
        requireNonBlank(roomId, "roomId");
        requireNonBlank(requestedByAdminId, "requestedByAdminId");
        Objects.requireNonNull(fromInclusive, "fromInclusive");
        Objects.requireNonNull(toExclusive, "toExclusive");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(requestedAt, "requestedAt");
        Objects.requireNonNull(startedAt, "startedAt");
        if (schemaVersion != CURRENT_SCHEMA_VERSION
                || !fromInclusive.isBefore(toExclusive)
                || capturedChangeSequence < 0
                || messageCount < 0
                || changeCount < 0
                || createdCount < 0
                || updatedCount < 0
                || deletedCount < 0) {
            throw new IllegalArgumentException(
                    "Malformed admin room conversation export job");
        }
        validateStatus(status, completedAt, deliveryCompletedAt,
                artifactSizeBytes, artifactSha256, failureCode);
    }

    public static AdminRoomConversationExportJob running(
            String exportId,
            String roomId,
            AdminRoomConversationExportRange range,
            long capturedChangeSequence,
            String adminId,
            Instant requestedAt
    ) {
        return new AdminRoomConversationExportJob(
                exportId,
                CURRENT_SCHEMA_VERSION,
                roomId,
                range.fromInclusive(),
                range.toExclusive(),
                capturedChangeSequence,
                ChatExportStatus.RUNNING,
                adminId,
                requestedAt,
                requestedAt,
                null,
                null,
                0,
                0,
                0,
                0,
                0,
                null,
                null,
                null);
    }

    private static void validateStatus(
            ChatExportStatus status,
            Instant completedAt,
            Instant deliveryCompletedAt,
            Long artifactSizeBytes,
            String artifactSha256,
            ChatExportFailureCode failureCode
    ) {
        if (status == ChatExportStatus.RUNNING) {
            if (completedAt != null
                    || deliveryCompletedAt != null
                    || artifactSizeBytes != null
                    || artifactSha256 != null
                    || failureCode != null) {
                throw new IllegalArgumentException("Malformed RUNNING job");
            }
            return;
        }
        if (completedAt == null) {
            throw new IllegalArgumentException("Completed time is required");
        }
        if (status == ChatExportStatus.SUCCEEDED) {
            if (deliveryCompletedAt == null
                    || artifactSizeBytes == null
                    || artifactSizeBytes < 0
                    || artifactSha256 == null
                    || !artifactSha256.matches("[0-9a-f]{64}")
                    || failureCode != null) {
                throw new IllegalArgumentException("Malformed SUCCEEDED job");
            }
        } else if (failureCode == null
                || deliveryCompletedAt != null
                || artifactSizeBytes != null
                || artifactSha256 != null) {
            throw new IllegalArgumentException("Malformed FAILED job");
        }
    }

    private static void requireNonBlank(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
    }
}
