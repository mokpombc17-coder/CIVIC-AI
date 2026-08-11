package com.hamcheeze.chat.message.audit.mongo;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.index.Index;

import java.util.Objects;

public final class MongoChatMessageAuditSchemaInitializer {

    public static final String ROOM_CHANGE_SEQUENCE_INDEX_NAME =
            "uk_chat_message_audit_room_change_sequence";
    public static final String MESSAGE_VERSION_INDEX_NAME =
            "uk_chat_message_audit_message_version";

    private final MongoOperations mongoOperations;

    public MongoChatMessageAuditSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    public void initialize() {
        ensureCollection(MongoChatMessageAuditEventDocument.COLLECTION_NAME);
        ensureCollection(
                MongoRoomMessageAuditSequenceDocument.COLLECTION_NAME);
        mongoOperations
                .indexOps(MongoChatMessageAuditEventDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .on("roomChangeSequence", Sort.Direction.ASC)
                        .named(ROOM_CHANGE_SEQUENCE_INDEX_NAME)
                        .unique());
        mongoOperations
                .indexOps(MongoChatMessageAuditEventDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("messageId", Sort.Direction.ASC)
                        .on("messageVersion", Sort.Direction.ASC)
                        .named(MESSAGE_VERSION_INDEX_NAME)
                        .unique());
    }

    private void ensureCollection(String collectionName) {
        if (!mongoOperations.collectionExists(collectionName)) {
            mongoOperations.createCollection(collectionName);
        }
    }
}
