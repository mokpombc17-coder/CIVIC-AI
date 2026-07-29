package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.query.ChatMessageHistoryReader;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.util.List;
import java.util.Objects;

public final class MongoChatMessageHistoryReader
        implements ChatMessageHistoryReader {

    private final MongoOperations mongoOperations;

    public MongoChatMessageHistoryReader(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public List<ChatMessage> findAfter(
            String roomId,
            long afterSequence,
            int limit
    ) {
        if (roomId == null || roomId.isBlank()) {
            throw new IllegalArgumentException(
                    "roomId must not be blank");
        }
        if (afterSequence < 0) {
            throw new IllegalArgumentException(
                    "afterSequence must not be negative");
        }
        if (limit < 1) {
            throw new IllegalArgumentException(
                    "limit must be positive");
        }
        Query query = Query.query(
                        Criteria.where("roomId")
                                .is(roomId)
                                .and("roomSequence")
                                .gt(afterSequence))
                .with(Sort.by(
                        Sort.Direction.ASC,
                        "roomSequence"))
                .limit(limit);
        return mongoOperations.find(
                        query,
                        MongoChatMessageDocument.class,
                        MongoChatMessageDocument.COLLECTION_NAME)
                .stream()
                .map(MongoChatMessageDocument::toDomain)
                .toList();
    }
}
