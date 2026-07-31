package com.hamcheeze.chat.message.mongo;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.index.Index;

import java.util.Objects;

public final class MongoChatMessageMutationSchemaInitializer {

    public static final String IDEMPOTENCY_INDEX_NAME =
            "uk_chat_message_mutation_receipt";

    private final MongoOperations mongoOperations;

    public MongoChatMessageMutationSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    public void initialize() {
        String collection =
                MongoChatMessageMutationReceiptDocument.COLLECTION_NAME;
        if (!mongoOperations.collectionExists(collection)) {
            mongoOperations.createCollection(collection);
        }
        mongoOperations.indexOps(collection)
                .createIndex(new Index()
                        .on("actorUserId", Sort.Direction.ASC)
                        .on("clientMutationId", Sort.Direction.ASC)
                        .named(IDEMPOTENCY_INDEX_NAME)
                        .unique());
    }
}
