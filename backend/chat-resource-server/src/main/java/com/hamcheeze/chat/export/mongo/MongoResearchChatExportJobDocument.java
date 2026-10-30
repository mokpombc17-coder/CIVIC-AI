package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.ChatExportFailureCode;
import com.hamcheeze.chat.export.ChatExportStatus;
import com.hamcheeze.chat.export.ResearchChatExportJob;
import org.springframework.data.annotation.TypeAlias;
import org.springframework.data.mongodb.core.mapping.MongoId;
import org.springframework.data.mongodb.core.mapping.FieldType;

import java.time.Instant;

@TypeAlias("researchChatExportJob")
public record MongoResearchChatExportJobDocument(
        @MongoId(FieldType.STRING) String exportId,
        int schemaVersion,
        String roomId,
        long capturedChangeSequence,
        ChatExportStatus status,
        String requestedByResearcherId,
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
            "chat_research_export_jobs";

    public MongoResearchChatExportJobDocument {
        new ResearchChatExportJob(
                exportId, schemaVersion, roomId, capturedChangeSequence,
                status, requestedByResearcherId, requestedAt, startedAt,
                completedAt, deliveryCompletedAt, messageCount, changeCount,
                createdCount, updatedCount, deletedCount, artifactSizeBytes,
                artifactSha256, failureCode);
    }

    public static MongoResearchChatExportJobDocument fromDomain(
            ResearchChatExportJob job
    ) {
        return new MongoResearchChatExportJobDocument(
                job.exportId(), job.schemaVersion(), job.roomId(),
                job.capturedChangeSequence(), job.status(),
                job.requestedByResearcherId(), job.requestedAt(),
                job.startedAt(), job.completedAt(),
                job.deliveryCompletedAt(), job.messageCount(),
                job.changeCount(), job.createdCount(), job.updatedCount(),
                job.deletedCount(), job.artifactSizeBytes(),
                job.artifactSha256(), job.failureCode());
    }

    public ResearchChatExportJob toDomain() {
        return new ResearchChatExportJob(
                exportId, schemaVersion, roomId, capturedChangeSequence,
                status, requestedByResearcherId, requestedAt, startedAt,
                completedAt, deliveryCompletedAt, messageCount, changeCount,
                createdCount, updatedCount, deletedCount, artifactSizeBytes,
                artifactSha256, failureCode);
    }
}
