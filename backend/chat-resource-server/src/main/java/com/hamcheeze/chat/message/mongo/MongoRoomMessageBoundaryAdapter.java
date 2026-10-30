package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.room.application.RoomMessageBoundaryPort;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.util.Objects;

public final class MongoRoomMessageBoundaryAdapter
        implements RoomMessageBoundaryPort {

    private final MongoOperations mongoOperations;

    public MongoRoomMessageBoundaryAdapter(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public long captureCurrentSequence(String roomId) {
        if (roomId == null || roomId.isBlank()) {
            throw new IllegalArgumentException(
                    "roomId must not be blank");
        }
        Query query = Query.query(
                Criteria.where("_id").is(roomId));
        Update update = new Update()
                .setOnInsert("lastSequence", 0L)
                .inc("boundaryRevision", 1L);
        FindAndModifyOptions options = FindAndModifyOptions.options()
                .upsert(true)
                .returnNew(true);
        MongoRoomSequenceDocument result =
                mongoOperations.findAndModify(
                        query,
                        update,
                        options,
                        MongoRoomSequenceDocument.class);
        if (result == null || result.lastSequence() < 0) {
            throw new IllegalStateException(
                    "MongoDB returned an invalid room message boundary");
        }
        return result.lastSequence();
    }
}
