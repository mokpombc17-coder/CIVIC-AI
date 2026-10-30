package com.hamcheeze.chat.message.outbox.mongo;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.index.Index;

import java.util.Objects;

public final class MongoChatMessageOutboxSchemaInitializer {

    public static final String DISPATCH_INDEX_NAME =
            "ix_chat_outbox_dispatch";
    public static final String OLDEST_INDEX_NAME =
            "ix_chat_outbox_oldest";

    private final MongoOperations mongoOperations;

    public MongoChatMessageOutboxSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    public void initialize() {
        String collection =
                MongoChatMessageOutboxDocument.COLLECTION_NAME;
        if (!mongoOperations.collectionExists(collection)) {
            mongoOperations.createCollection(collection);
        }
        mongoOperations.indexOps(collection)
                .createIndex(new Index()
                        .on("schemaVersion", Sort.Direction.ASC)
                        .on("aggregateType", Sort.Direction.ASC)
                        .on("eventType", Sort.Direction.ASC)
                        .on("eventVersion", Sort.Direction.ASC)
                        .on("nextAttemptAt", Sort.Direction.ASC)
                        .on("occurredAt", Sort.Direction.ASC)
                        .on("_id", Sort.Direction.ASC)
                        .named(DISPATCH_INDEX_NAME));
        mongoOperations.indexOps(collection)
                .createIndex(new Index()
                        .on("occurredAt", Sort.Direction.ASC)
                        .on("_id", Sort.Direction.ASC)
                        .named(OLDEST_INDEX_NAME));
    }
}
