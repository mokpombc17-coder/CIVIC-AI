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
    public List<ChatMessage> findLatest(
            String roomId,
            long messageVisibleAfterSequence,
            int limit
    ) {
        requireInputs(roomId, messageVisibleAfterSequence, limit);
        return findBackward(
                Criteria.where("roomId").is(roomId)
                        .and("roomSequence")
                        .gt(messageVisibleAfterSequence),
                limit);
    }

    @Override
    public List<ChatMessage> findBefore(
            String roomId,
            long messageVisibleAfterSequence,
            long beforeSequence,
            int limit
    ) {
        requireInputs(roomId, messageVisibleAfterSequence, limit);
        if (beforeSequence < 1) {
            throw new IllegalArgumentException(
                    "beforeSequence must be at least 1");
        }
        return findBackward(
                Criteria.where("roomId")
                        .is(roomId)
                        .and("roomSequence")
                        .gt(messageVisibleAfterSequence)
                        .lt(beforeSequence),
                limit);
    }

    @Override
    public List<ChatMessage> findAfter(
            String roomId,
            long messageVisibleAfterSequence,
            long afterSequence,
            int limit
    ) {
        requireInputs(roomId, messageVisibleAfterSequence, limit);
        if (afterSequence < 0) {
            throw new IllegalArgumentException(
                    "afterSequence must not be negative");
        }
        long effectiveAfterSequence = Math.max(
                messageVisibleAfterSequence,
                afterSequence);
        Query query = Query.query(
                        Criteria.where("roomId")
                                .is(roomId)
                                .and("roomSequence")
                                .gt(effectiveAfterSequence))
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

    private List<ChatMessage> findBackward(
            Criteria criteria,
            int limit
    ) {
        Query query = Query.query(criteria)
                .with(Sort.by(
                        Sort.Direction.DESC,
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

    private static void requireInputs(
            String roomId,
            long messageVisibleAfterSequence,
            int limit
    ) {
        if (roomId == null || roomId.isBlank()) {
            throw new IllegalArgumentException(
                    "roomId must not be blank");
        }
        if (limit < 1) {
            throw new IllegalArgumentException(
                    "limit must be positive");
        }
        if (messageVisibleAfterSequence < 0) {
            throw new IllegalArgumentException(
                    "messageVisibleAfterSequence must not be negative");
        }
    }
}
