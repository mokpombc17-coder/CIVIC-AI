package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.AdminRoomConversationExportJob;
import com.hamcheeze.chat.export.ChatExportFailureCode;
import com.hamcheeze.chat.export.ChatExportStatus;
import org.springframework.data.annotation.TypeAlias;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;

@TypeAlias("adminRoomConversationExportJob")
public record MongoAdminRoomConversationExportJobDocument(
        @MongoId(FieldType.STRING) String exportId,
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

    public static final String COLLECTION_NAME =
            "chat_admin_room_conversation_export_jobs";

    public MongoAdminRoomConversationExportJobDocument {
        new AdminRoomConversationExportJob(
                exportId, schemaVersion, roomId, fromInclusive, toExclusive,
                capturedChangeSequence, status, requestedByAdminId,
                requestedAt, startedAt, completedAt, deliveryCompletedAt,
                messageCount, changeCount, createdCount, updatedCount,
                deletedCount, artifactSizeBytes, artifactSha256, failureCode);
    }

    public static MongoAdminRoomConversationExportJobDocument fromDomain(
            AdminRoomConversationExportJob job
    ) {
        return new MongoAdminRoomConversationExportJobDocument(
                job.exportId(), job.schemaVersion(), job.roomId(),
                job.fromInclusive(), job.toExclusive(),
                job.capturedChangeSequence(), job.status(),
                job.requestedByAdminId(), job.requestedAt(), job.startedAt(),
                job.completedAt(), job.deliveryCompletedAt(),
                job.messageCount(), job.changeCount(), job.createdCount(),
                job.updatedCount(), job.deletedCount(),
                job.artifactSizeBytes(), job.artifactSha256(),
                job.failureCode());
    }

    public AdminRoomConversationExportJob toDomain() {
        return new AdminRoomConversationExportJob(
                exportId, schemaVersion, roomId, fromInclusive, toExclusive,
                capturedChangeSequence, status, requestedByAdminId,
                requestedAt, startedAt, completedAt, deliveryCompletedAt,
                messageCount, changeCount, createdCount, updatedCount,
                deletedCount, artifactSizeBytes, artifactSha256, failureCode);
    }
}
