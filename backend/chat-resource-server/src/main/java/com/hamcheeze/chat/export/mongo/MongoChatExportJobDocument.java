package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.ChatExportFailureCode;
import com.hamcheeze.chat.export.ChatExportJob;
import com.hamcheeze.chat.export.ChatExportMode;
import com.hamcheeze.chat.export.ChatExportStatus;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;

@Document(collection = MongoChatExportJobDocument.COLLECTION_NAME)
public record MongoChatExportJobDocument(
        @MongoId(FieldType.STRING) String exportId,
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

    public static final String COLLECTION_NAME = "chat_export_jobs";

    public MongoChatExportJobDocument {
        toJob(
                exportId,
                schemaVersion,
                roomId,
                mode,
                baseExportId,
                fromChangeSequenceExclusive,
                toChangeSequenceInclusive,
                status,
                requestedByAdminId,
                requestedAt,
                startedAt,
                completedAt,
                deliveryCompletedAt,
                eventCount,
                createdCount,
                updatedCount,
                deletedCount,
                artifactSizeBytes,
                artifactSha256,
                failureCode);
    }

    public static MongoChatExportJobDocument fromDomain(ChatExportJob job) {
        return new MongoChatExportJobDocument(
                job.exportId(),
                job.schemaVersion(),
                job.roomId(),
                job.mode(),
                job.baseExportId(),
                job.fromChangeSequenceExclusive(),
                job.toChangeSequenceInclusive(),
                job.status(),
                job.requestedByAdminId(),
                job.requestedAt(),
                job.startedAt(),
                job.completedAt(),
                job.deliveryCompletedAt(),
                job.eventCount(),
                job.createdCount(),
                job.updatedCount(),
                job.deletedCount(),
                job.artifactSizeBytes(),
                job.artifactSha256(),
                job.failureCode());
    }

    public ChatExportJob toDomain() {
        return toJob(
                exportId,
                schemaVersion,
                roomId,
                mode,
                baseExportId,
                fromChangeSequenceExclusive,
                toChangeSequenceInclusive,
                status,
                requestedByAdminId,
                requestedAt,
                startedAt,
                completedAt,
                deliveryCompletedAt,
                eventCount,
                createdCount,
                updatedCount,
                deletedCount,
                artifactSizeBytes,
                artifactSha256,
                failureCode);
    }

    private static ChatExportJob toJob(
            String exportId,
            int schemaVersion,
            String roomId,
            ChatExportMode mode,
            String baseExportId,
            long fromExclusive,
            long toInclusive,
            ChatExportStatus status,
            String adminId,
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
        return new ChatExportJob(
                exportId,
                schemaVersion,
                roomId,
                mode,
                baseExportId,
                fromExclusive,
                toInclusive,
                status,
                adminId,
                requestedAt,
                startedAt,
                completedAt,
                deliveryCompletedAt,
                eventCount,
                createdCount,
                updatedCount,
                deletedCount,
                artifactSizeBytes,
                artifactSha256,
                failureCode);
    }
}
