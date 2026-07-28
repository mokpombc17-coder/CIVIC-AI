package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.persistence.RoomStore;
import com.mongodb.client.result.UpdateResult;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.ReplaceOptions;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.util.Objects;
import java.util.Optional;

public final class MongoRoomStore implements RoomStore {

    private final MongoOperations mongoOperations;

    public MongoRoomStore(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public Optional<Room> findById(String roomId) {
        String id = requireNonBlank(roomId, "roomId");
        MongoRoomDocument document = mongoOperations.findById(
                id,
                MongoRoomDocument.class,
                MongoRoomDocument.COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoRoomDocument::toDomain);
    }

    @Override
    public void insert(Room room) {
        mongoOperations.insert(
                MongoRoomDocument.fromDomain(
                        Objects.requireNonNull(room, "room")),
                MongoRoomDocument.COLLECTION_NAME);
    }

    @Override
    public boolean replaceIfVersionMatches(
            Room room,
            long expectedVersion
    ) {
        Room replacement = Objects.requireNonNull(room, "room");
        requireNextVersion(
                expectedVersion,
                replacement.version());
        Query query = Query.query(
                Criteria.where("_id")
                        .is(replacement.roomId())
                        .and("version")
                        .is(expectedVersion));
        UpdateResult result = mongoOperations.replace(
                query,
                MongoRoomDocument.fromDomain(replacement),
                ReplaceOptions.none(),
                MongoRoomDocument.COLLECTION_NAME);
        return result.getModifiedCount() == 1;
    }

    private static void requireNextVersion(
            long expectedVersion,
            long actualVersion
    ) {
        if (expectedVersion < 0
                || expectedVersion == Long.MAX_VALUE
                || actualVersion != expectedVersion + 1) {
            throw new IllegalArgumentException(
                    "room.version must equal expectedVersion + 1");
        }
    }

    private static String requireNonBlank(
            String value,
            String fieldName
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
        return value;
    }
}
