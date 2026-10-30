package com.hamcheeze.chat.room.inbox.summary.maintenance.mongo;

import com.hamcheeze.chat.message.mongo.MongoChatMessageDocument;
import com.hamcheeze.chat.message.mongo.MongoChatMessageSchemaInitializer;
import com.hamcheeze.chat.message.mongo.MongoRoomSequenceDocument;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryMaintenanceMode;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoOperations;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class MongoRoomInboxSummaryMaintenancePreflight {

    private final MongoOperations mongoOperations;

    public MongoRoomInboxSummaryMaintenancePreflight(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    public void verify(RoomInboxSummaryMaintenanceMode mode) {
        requireCollection(MongoChatMessageDocument.COLLECTION_NAME);
        requireCollection(MongoRoomSequenceDocument.COLLECTION_NAME);
        requireRoomSequenceIndex();
        if (mode == RoomInboxSummaryMaintenanceMode.VALIDATE
                && !mongoOperations.collectionExists(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)) {
            throw new PreflightException(
                    "required-summary-collection-missing");
        }
    }

    private void requireCollection(String collectionName) {
        if (!mongoOperations.collectionExists(collectionName)) {
            throw new PreflightException(
                    "required-source-collection-missing");
        }
    }

    private void requireRoomSequenceIndex() {
        Document required = null;
        for (Document index : mongoOperations
                .getCollection(MongoChatMessageDocument.COLLECTION_NAME)
                .listIndexes()) {
            if (MongoChatMessageSchemaInitializer.ROOM_SEQUENCE_INDEX_NAME
                    .equals(index.getString("name"))) {
                required = index;
                break;
            }
        }
        if (required == null) {
            throw new PreflightException(
                    "required-source-index-missing");
        }
        Object rawKey = required.get("key");
        if (!(rawKey instanceof Document key)
                || !hasExactRoomSequenceKey(key)
                || !Boolean.TRUE.equals(required.get("unique"))) {
            throw new PreflightException(
                    "required-source-index-invalid");
        }
    }

    private static boolean hasExactRoomSequenceKey(Document key) {
        List<String> names = new ArrayList<>(key.keySet());
        return names.equals(List.of("roomId", "roomSequence"))
                && Integer.valueOf(1).equals(key.get("roomId"))
                && Integer.valueOf(1).equals(key.get("roomSequence"));
    }

    public static final class PreflightException
            extends RuntimeException {

        private final String failureKind;

        PreflightException(String failureKind) {
            super(failureKind);
            this.failureKind = failureKind;
        }

        public String failureKind() {
            return failureKind;
        }
    }
}
