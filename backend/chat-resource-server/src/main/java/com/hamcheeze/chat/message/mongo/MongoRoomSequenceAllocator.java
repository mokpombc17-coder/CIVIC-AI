package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.util.Objects;

final class MongoRoomSequenceAllocator {

    private final MongoOperations mongoOperations;

    MongoRoomSequenceAllocator(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    long next(String roomId) {
        Query query = Query.query(
                Criteria.where("_id").is(roomId));
        Update update = new Update()
                .setOnInsert("boundaryRevision", 0L)
                .inc("lastSequence", 1L);
        FindAndModifyOptions options = FindAndModifyOptions.options()
                .upsert(true)
                .returnNew(true);

        MongoRoomSequenceDocument result =
                mongoOperations.findAndModify(
                        query,
                        update,
                        options,
                        MongoRoomSequenceDocument.class);
        if (result == null || result.lastSequence() < 1) {
            throw new ChatMessageStoreException(
                    ChatMessageStoreFailureKind.PERMANENT,
                    "MongoDB returned an invalid room sequence for roomId="
                            + roomId);
        }
        return result.lastSequence();
    }
}
