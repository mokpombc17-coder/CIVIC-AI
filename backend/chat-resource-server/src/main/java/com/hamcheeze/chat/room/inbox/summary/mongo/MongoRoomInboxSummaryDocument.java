package com.hamcheeze.chat.room.inbox.summary.mongo;

import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;
import java.util.Date;

@Document(collection = MongoRoomInboxSummaryDocument.COLLECTION_NAME)
public record MongoRoomInboxSummaryDocument(
        @MongoId(FieldType.STRING)
        String roomId,
        int schemaVersion,
        RoomInboxLastMessage lastMessage,
        Instant lastActivityAt,
        Instant updatedAt
) {

    public static final String COLLECTION_NAME =
            "chat_room_inbox_summaries";
    public static final int CURRENT_SCHEMA_VERSION = 1;

    @PersistenceCreator
    public MongoRoomInboxSummaryDocument {
        if (schemaVersion != CURRENT_SCHEMA_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported room inbox summary schema version");
        }
        new RoomInboxSummary(
                roomId,
                lastMessage,
                lastActivityAt,
                updatedAt);
    }

    public RoomInboxSummary toDomain() {
        return new RoomInboxSummary(
                roomId,
                lastMessage,
                lastActivityAt,
                updatedAt);
    }

    public static MongoRoomInboxSummaryDocument fromDomain(
            RoomInboxSummary summary
    ) {
        return new MongoRoomInboxSummaryDocument(
                summary.roomId(),
                CURRENT_SCHEMA_VERSION,
                summary.lastMessage(),
                summary.lastActivityAt(),
                summary.updatedAt());
    }

    public org.bson.Document toBson() {
        return new org.bson.Document("_id", roomId)
                .append("schemaVersion", schemaVersion)
                .append("lastMessage", new org.bson.Document(
                        "messageId", lastMessage.messageId())
                        .append("roomSequence",
                                lastMessage.roomSequence())
                        .append("messageVersion",
                                lastMessage.messageVersion())
                        .append("state", lastMessage.state().name())
                        .append("preview", lastMessage.preview())
                        .append("previewTruncated",
                                lastMessage.previewTruncated())
                        .append("createdAt",
                                Date.from(lastMessage.createdAt())))
                .append("lastActivityAt", Date.from(lastActivityAt))
                .append("updatedAt", Date.from(updatedAt));
    }
}
