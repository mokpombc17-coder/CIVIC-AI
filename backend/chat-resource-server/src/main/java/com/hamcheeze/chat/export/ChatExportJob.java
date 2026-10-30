package com.hamcheeze.chat.export;

import java.time.Instant;
import java.util.Objects;

public record ChatExportJob(
        String exportId,
        int schemaVersion,
        String roomId,
        ChatExportMode mode,
        String baseExportId,
        long fromChangeSequenceExclusive,
        long toChangeSequenceInclusive,
        ChatExportStatus status,
        String requestedByAdminId,
        Instant requestedAt,
        Instant startedAt,
        Instant completedAt,
        Instant deliveryCompletedAt,
        long eventCount,
        long createdCount,
        long updatedCount,
        long deletedCount,
        Long artifactSizeBytes,
        String artifactSha256,
        ChatExportFailureCode failureCode
) {

    public static final int CURRENT_SCHEMA_VERSION = 1;

    public ChatExportJob {
        requireNonBlank(exportId, "exportId");
        requireNonBlank(roomId, "roomId");
        requireNonBlank(requestedByAdminId, "requestedByAdminId");
        Objects.requireNonNull(mode, "mode");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(requestedAt, "requestedAt");
        Objects.requireNonNull(startedAt, "startedAt");
        if (schemaVersion != CURRENT_SCHEMA_VERSION
                || fromChangeSequenceExclusive < 0
                || toChangeSequenceInclusive < fromChangeSequenceExclusive
                || eventCount < 0
                || createdCount < 0
                || updatedCount < 0
                || deletedCount < 0) {
            throw new IllegalArgumentException("Malformed export job");
        }
        if (mode == ChatExportMode.FULL
                && (baseExportId != null
                || fromChangeSequenceExclusive != 0)) {
            throw new IllegalArgumentException("Malformed FULL export job");
        }
        if (mode == ChatExportMode.INCREMENTAL
                && (baseExportId == null || baseExportId.isBlank())) {
            throw new IllegalArgumentException(
                    "Incremental export base is required");
        }
        validateStatus(
                status,
                completedAt,
                deliveryCompletedAt,
                artifactSizeBytes,
                artifactSha256,
                failureCode);
    }

    public static ChatExportJob running(
            String exportId,
            String roomId,
            ChatExportMode mode,
            String baseExportId,
            long fromExclusive,
            long toInclusive,
            String adminId,
            Instant now
    ) {
        return new ChatExportJob(
                exportId,
                CURRENT_SCHEMA_VERSION,
                roomId,
                mode,
                baseExportId,
                fromExclusive,
                toInclusive,
                ChatExportStatus.RUNNING,
                adminId,
                now,
                now,
                null,
                null,
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
