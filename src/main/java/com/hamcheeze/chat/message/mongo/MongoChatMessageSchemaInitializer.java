package com.hamcheeze.chat.message.mongo;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.PartialIndexFilter;
import org.bson.Document;

import java.util.Objects;

public final class MongoChatMessageSchemaInitializer {

    public static final String IDEMPOTENCY_INDEX_NAME =
            "uk_chat_message_idempotency";
    public static final String ROOM_SEQUENCE_INDEX_NAME =
            "uk_chat_message_room_sequence";
    public static final String UNREAD_INDEX_NAME =
            "ix_chat_message_unread";

    private final MongoOperations mongoOperations;

    public MongoChatMessageSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    public void initialize() {
        ensureCollection(MongoChatMessageDocument.COLLECTION_NAME);
        ensureCollection(MongoRoomSequenceDocument.COLLECTION_NAME);

        mongoOperations
                .indexOps(MongoChatMessageDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .on("senderUserId", Sort.Direction.ASC)
                        .on("clientMessageId", Sort.Direction.ASC)
                        .named(IDEMPOTENCY_INDEX_NAME)
                        .unique());

        mongoOperations
                .indexOps(MongoChatMessageDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .on("roomSequence", Sort.Direction.ASC)
                        .named(ROOM_SEQUENCE_INDEX_NAME)
                        .unique());

        mongoOperations
                .indexOps(MongoChatMessageDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .on("roomSequence", Sort.Direction.ASC)
                        .on("senderUserId", Sort.Direction.ASC)
                        .named(UNREAD_INDEX_NAME)
                        .partial(PartialIndexFilter.of(
                                new Document("state", "ACTIVE")
                                        .append("countable", true))));
    }

    private void ensureCollection(String collectionName) {
        if (!mongoOperations.collectionExists(collectionName)) {
            mongoOperations.createCollection(collectionName);
        }
    }
}
