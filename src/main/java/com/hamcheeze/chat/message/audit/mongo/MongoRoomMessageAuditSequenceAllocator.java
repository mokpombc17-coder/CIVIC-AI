package com.hamcheeze.chat.message.audit.mongo;

import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.util.Objects;

final class MongoRoomMessageAuditSequenceAllocator {

    private final MongoOperations mongoOperations;

    MongoRoomMessageAuditSequenceAllocator(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    long next(String roomId) {
        Query query = Query.query(Criteria.where("_id").is(roomId));
        Update update = new Update().inc("lastSequence", 1L);
        MongoRoomMessageAuditSequenceDocument result =
                mongoOperations.findAndModify(
                        query,
                        update,
                        FindAndModifyOptions.options()
                                .upsert(true)
                                .returnNew(true),
                        MongoRoomMessageAuditSequenceDocument.class);
        if (result == null || result.lastSequence() < 1) {
            throw new IllegalStateException(
                    "MongoDB returned an invalid message audit sequence");
        }
        return result.lastSequence();
    }
}
