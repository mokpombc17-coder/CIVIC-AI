package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.room.inbox.RoomSequenceReader;
import org.springframework.data.mongodb.core.MongoOperations;

import java.util.Objects;

public final class MongoRoomSequenceReader
        implements RoomSequenceReader {

    private final MongoOperations mongoOperations;

    public MongoRoomSequenceReader(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    @Override
    public long currentSequence(String roomId) {
        if (roomId == null || roomId.isBlank()) {
            throw new IllegalArgumentException(
                    "roomId must not be blank");
        }
        MongoRoomSequenceDocument document = mongoOperations.findById(
                roomId,
                MongoRoomSequenceDocument.class,
                MongoRoomSequenceDocument.COLLECTION_NAME);
        if (document == null) {
            return 0;
        }
        if (document.lastSequence() < 0) {
            throw new IllegalStateException(
                    "Room sequence must not be negative");
        }
        return document.lastSequence();
    }
}
