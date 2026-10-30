package com.hamcheeze.chat.room.inbox.summary.mongo;

import org.springframework.data.mongodb.core.MongoOperations;

import java.util.Objects;

public final class MongoRoomInboxSummarySchemaInitializer {

    private final MongoOperations mongoOperations;

    public MongoRoomInboxSummarySchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    public void initialize() {
        if (!mongoOperations.collectionExists(
                MongoRoomInboxSummaryDocument.COLLECTION_NAME)) {
            mongoOperations.createCollection(
                    MongoRoomInboxSummaryDocument.COLLECTION_NAME);
        }
    }
}
