package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.ChatExportFailureCode;
import com.hamcheeze.chat.export.ChatExportStatus;
import com.hamcheeze.chat.export.ResearchChatExportCompletion;
import com.hamcheeze.chat.export.ResearchChatExportJob;
import com.hamcheeze.chat.export.ResearchChatExportJobStore;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class MongoResearchChatExportJobStore
        implements ResearchChatExportJobStore {

    private final MongoOperations mongoOperations;

    public MongoResearchChatExportJobStore(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public void insertRunning(ResearchChatExportJob job) {
        mongoOperations.insert(
                MongoResearchChatExportJobDocument.fromDomain(job),
                MongoResearchChatExportJobDocument.COLLECTION_NAME);
    }

    @Override
    public List<ResearchChatExportJob> findRunning() {
        Query query = Query.query(
                        Criteria.where("status").is(ChatExportStatus.RUNNING))
                .with(Sort.by(Sort.Order.asc("startedAt")));
        return mongoOperations.find(
                        query,
                        MongoResearchChatExportJobDocument.class,
                        MongoResearchChatExportJobDocument.COLLECTION_NAME)
                .stream()
                .map(MongoResearchChatExportJobDocument::toDomain)
                .toList();
    }

    @Override
    public boolean markSucceeded(
            String exportId,
            ResearchChatExportCompletion completion
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
                MongoResearchChatExportJobDocument.COLLECTION_NAME)
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
                MongoResearchChatExportJobDocument.COLLECTION_NAME)
                .getModifiedCount() == 1;
    }

    private Query runningJob(String exportId) {
        return Query.query(new Criteria().andOperator(
                Criteria.where("_id").is(exportId),
                Criteria.where("status").is(ChatExportStatus.RUNNING)));
    }
}
