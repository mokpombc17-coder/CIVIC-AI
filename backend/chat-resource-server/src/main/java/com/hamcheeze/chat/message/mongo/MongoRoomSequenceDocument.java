package com.hamcheeze.chat.message.mongo;

import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.util.Objects;

@Document(collection = MongoRoomSequenceDocument.COLLECTION_NAME)
public record MongoRoomSequenceDocument(
        @MongoId(FieldType.STRING)
        String roomId,
        long lastSequence,
        long boundaryRevision
) {

    public static final String COLLECTION_NAME = "chat_room_sequences";

    @PersistenceCreator
    public MongoRoomSequenceDocument {
        Objects.requireNonNull(roomId, "roomId");
        if (lastSequence < 0 || boundaryRevision < 0) {
            throw new IllegalArgumentException(
                    "Room sequence state must not be negative");
        }
    }
}
