package com.hamcheeze.chat.room.inbox.summary.mongo;

import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;

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
}
