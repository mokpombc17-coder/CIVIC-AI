package com.hamcheeze.chat.room.inbox.mongo;

import com.hamcheeze.chat.room.inbox.RoomReadState;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;
import java.util.Objects;

@Document(collection = MongoRoomReadStateDocument.COLLECTION_NAME)
public record MongoRoomReadStateDocument(
        @MongoId(FieldType.STRING)
        String membershipId,
        int schemaVersion,
        String roomId,
        String userId,
        long lastReadSequence,
        Instant updatedAt
) {

    public static final String COLLECTION_NAME =
            "chat_room_read_states";
    public static final int CURRENT_SCHEMA_VERSION = 1;

    @PersistenceCreator
    public MongoRoomReadStateDocument {
        if (schemaVersion != CURRENT_SCHEMA_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported room read state schema");
        }
        new RoomReadState(
                membershipId,
                roomId,
                userId,
                lastReadSequence,
                updatedAt);
    }

    RoomReadState toDomain() {
        return new RoomReadState(
                membershipId,
                roomId,
                userId,
                lastReadSequence,
                updatedAt);
    }
}
