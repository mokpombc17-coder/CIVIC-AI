package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.ChatExportCompletion;
import com.hamcheeze.chat.export.ChatExportFailureCode;
import com.hamcheeze.chat.export.ChatExportJob;
import com.hamcheeze.chat.export.ChatExportJobStore;
import com.hamcheeze.chat.export.ChatExportStatus;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class MongoChatExportJobStore implements ChatExportJobStore {

    private final MongoOperations mongoOperations;

    public MongoChatExportJobStore(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public void insertRunning(ChatExportJob job) {
        mongoOperations.insert(
                MongoChatExportJobDocument.fromDomain(job),
                MongoChatExportJobDocument.COLLECTION_NAME);
    }

    @Override
    public Optional<ChatExportJob> findLatestSucceeded(
            String roomId,
            String requestedByAdminId
    ) {
        Query query = Query.query(new Criteria().andOperator(
                        Criteria.where("roomId").is(roomId),
                        Criteria.where("requestedByAdminId")
                                .is(requestedByAdminId),
                        Criteria.where("status")
                                .is(ChatExportStatus.SUCCEEDED)))
                .with(Sort.by(
                        Sort.Order.desc("toChangeSequenceInclusive"),
                        Sort.Order.desc("completedAt")))
                .limit(1);
        MongoChatExportJobDocument document = mongoOperations.findOne(
                query,
                MongoChatExportJobDocument.class,
                MongoChatExportJobDocument.COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoChatExportJobDocument::toDomain);
    }

    @Override
    public List<ChatExportJob> findRunning() {
        return mongoOperations.find(
                        Query.query(Criteria.where("status")
                                .is(ChatExportStatus.RUNNING)),
                        MongoChatExportJobDocument.class,
                        MongoChatExportJobDocument.COLLECTION_NAME)
                .stream()
                .map(MongoChatExportJobDocument::toDomain)
                .toList();
    }

    @Override
    public boolean markSucceeded(
            String exportId,
            ChatExportCompletion completion
    ) {
        Update update = new Update()
                .set("status", ChatExportStatus.SUCCEEDED)
                .set("completedAt", completion.completedAt())
                .set(
                        "deliveryCompletedAt",
                        completion.deliveryCompletedAt())
                .set("eventCount", completion.eventCount())
                .set("createdCount", completion.createdCount())
                .set("updatedCount", completion.updatedCount())
                .set("deletedCount", completion.deletedCount())
                .set("artifactSizeBytes", completion.artifactSizeBytes())
                .set("artifactSha256", completion.artifactSha256())
                .unset("failureCode");
        return mongoOperations.updateFirst(
                runningJob(exportId),
                update,
                MongoChatExportJobDocument.COLLECTION_NAME)
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
                MongoChatExportJobDocument.COLLECTION_NAME)
                .getModifiedCount() == 1;
    }

    private Query runningJob(String exportId) {
        return Query.query(new Criteria().andOperator(
                Criteria.where("_id").is(exportId),
                Criteria.where("status").is(ChatExportStatus.RUNNING)));
    }
}
