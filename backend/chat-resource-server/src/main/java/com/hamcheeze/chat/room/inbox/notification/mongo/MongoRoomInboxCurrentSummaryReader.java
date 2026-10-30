package com.hamcheeze.chat.room.inbox.notification.mongo;

import com.hamcheeze.chat.room.inbox.notification.RoomInboxCurrentLastMessage;
import com.hamcheeze.chat.room.inbox.notification.RoomInboxCurrentSummaryReadException;
import com.hamcheeze.chat.room.inbox.notification.RoomInboxCurrentSummaryReader;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.mongodb.client.model.Filters;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoOperations;

import java.util.Optional;

public final class MongoRoomInboxCurrentSummaryReader
        implements RoomInboxCurrentSummaryReader {

    private final MongoOperations mongoOperations;

    public MongoRoomInboxCurrentSummaryReader(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = java.util.Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    @Override
    public Optional<RoomInboxCurrentLastMessage> findCurrent(
            String roomId
    ) {
        if (roomId == null || roomId.isBlank()) {
            throw new IllegalArgumentException(
                    "roomId must not be blank");
        }
        try {
            Document raw = mongoOperations.getCollection(
                            MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                    .find(Filters.eq("_id", roomId))
                    .first();
            if (raw == null) {
                return Optional.empty();
            }
            return Optional.of(map(raw));
        } catch (RoomInboxCurrentSummaryReadException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new RoomInboxCurrentSummaryReadException(
                    "storage-or-runtime-failure", exception);
        }
    }

    private RoomInboxCurrentLastMessage map(Document raw) {
        Object schemaVersion = raw.get("schemaVersion");
        if (!(schemaVersion instanceof Integer value)
                || value
                != MongoRoomInboxSummaryDocument.CURRENT_SCHEMA_VERSION) {
            throw new RoomInboxCurrentSummaryReadException(
                    "unsupported-schema", null);
        }
        Object rawLastMessage = raw.get("lastMessage");
        if (!(rawLastMessage instanceof Document lastMessage)
                || !(lastMessage.get("roomSequence") instanceof Long)
                || !(lastMessage.get("messageVersion") instanceof Long)) {
            throw new RoomInboxCurrentSummaryReadException(
                    "malformed-summary", null);
        }
        try {
            return RoomInboxCurrentLastMessage.from(
                    mongoOperations.getConverter()
                            .read(MongoRoomInboxSummaryDocument.class, raw)
                            .toDomain()
                            .lastMessage());
        } catch (RuntimeException exception) {
            throw new RoomInboxCurrentSummaryReadException(
                    "malformed-summary", exception);
        }
    }
}
