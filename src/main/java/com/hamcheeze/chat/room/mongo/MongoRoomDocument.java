package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;
import java.util.Objects;

@Document(collection = MongoRoomDocument.COLLECTION_NAME)
public record MongoRoomDocument(
        @MongoId(FieldType.STRING)
        String roomId,
        int schemaVersion,
        String name,
        String ownerUserId,
        RoomStatus status,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        int activeMemberCount,
        Instant createdAt,
        Instant closedAt,
        long version
) {

    public static final String COLLECTION_NAME = "chat_rooms";
    public static final int CURRENT_SCHEMA_VERSION = 2;
    static final int LEGACY_SCHEMA_VERSION = 1;

    @PersistenceCreator
    public MongoRoomDocument {
        Objects.requireNonNull(roomId, "roomId");
        if (schemaVersion == LEGACY_SCHEMA_VERSION && name == null) {
            name = roomId;
        }
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(ownerUserId, "ownerUserId");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(visibility, "visibility");
        Objects.requireNonNull(joinPolicy, "joinPolicy");
        Objects.requireNonNull(createdAt, "createdAt");
    }

    public static MongoRoomDocument fromDomain(Room room) {
        Objects.requireNonNull(room, "room");
        return new MongoRoomDocument(
                room.roomId(),
                CURRENT_SCHEMA_VERSION,
                room.name(),
                room.ownerUserId(),
                room.status(),
                room.visibility(),
                room.joinPolicy(),
                room.activeMemberCount(),
                room.createdAt(),
                room.closedAt(),
                room.version());
    }

    public Room toDomain() {
        requireCurrentSchema();
        return Room.restore(
                roomId,
                name,
                ownerUserId,
                status,
                visibility,
                joinPolicy,
                activeMemberCount,
                createdAt,
                closedAt,
                version);
    }

    private void requireCurrentSchema() {
        if (schemaVersion != LEGACY_SCHEMA_VERSION
                && schemaVersion != CURRENT_SCHEMA_VERSION) {
            throw new IllegalStateException(
                    "Unsupported schemaVersion "
                            + schemaVersion
                            + " in "
                            + COLLECTION_NAME);
        }
    }
}
