package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.AdminRoomConversationExportCompletion;
import com.hamcheeze.chat.export.AdminRoomConversationExportJob;
import com.hamcheeze.chat.export.AdminRoomConversationExportJobStore;
import com.hamcheeze.chat.export.ChatExportFailureCode;
import com.hamcheeze.chat.export.ChatExportStatus;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class MongoAdminRoomConversationExportJobStore
        implements AdminRoomConversationExportJobStore {

    private final MongoOperations mongoOperations;

    public MongoAdminRoomConversationExportJobStore(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public void insertRunning(AdminRoomConversationExportJob job) {
        mongoOperations.insert(
                MongoAdminRoomConversationExportJobDocument.fromDomain(job),
                MongoAdminRoomConversationExportJobDocument.COLLECTION_NAME);
    }

    @Override
    public List<AdminRoomConversationExportJob> findRunning() {
        Query query = Query.query(
                        Criteria.where("status").is(ChatExportStatus.RUNNING))
                .with(Sort.by(Sort.Order.asc("startedAt")));
        return mongoOperations.find(
                        query,
                        MongoAdminRoomConversationExportJobDocument.class,
                        MongoAdminRoomConversationExportJobDocument
                                .COLLECTION_NAME)
                .stream()
                .map(MongoAdminRoomConversationExportJobDocument::toDomain)
                .toList();
    }

    @Override
    public boolean markSucceeded(
            String exportId,
            AdminRoomConversationExportCompletion completion
    ) {
        Update update = new Update()
                .set("status", ChatExportStatus.SUCCEEDED)
                .set("completedAt", completion.completedAt())
                .set("deliveryCompletedAt", completion.deliveryCompletedAt())
                .set("messageCount", completion.messageCount())
                .set("changeCount", completion.changeCount())
                .set("createdCount", completion.createdCount())
                .set("updatedCount", completion.updatedCount())
                .set("deletedCount", completion.deletedCount())
                .set("artifactSizeBytes", completion.artifactSizeBytes())
                .set("artifactSha256", completion.artifactSha256())
                .unset("failureCode");
        return mongoOperations.updateFirst(
                runningJob(exportId),
                update,
                MongoAdminRoomConversationExportJobDocument.COLLECTION_NAME)
                .getModifiedCount() == 1;
    }

    @Override
    public boolean markFailed(
            String exportId,
            ChatExportFailureCode failureCode,
            Instant completedAt
    ) {
        Update update = new Update()
                .set("status", ChatExportStatus.FAILED)
                .set("completedAt", completedAt)
                .set("failureCode", failureCode)
                .unset("deliveryCompletedAt")
                .unset("artifactSizeBytes")
                .unset("artifactSha256");
        return mongoOperations.updateFirst(
                runningJob(exportId),
                update,
                MongoAdminRoomConversationExportJobDocument.COLLECTION_NAME)
                .getModifiedCount() == 1;
    }

    private Query runningJob(String exportId) {
        return Query.query(new Criteria().andOperator(
                Criteria.where("_id").is(exportId),
                Criteria.where("status").is(ChatExportStatus.RUNNING)));
    }
}
