package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.context.ChatMessageContextReader;
import com.hamcheeze.chat.message.context.ChatMessageContextReaderException;
import org.bson.codecs.configuration.CodecConfigurationException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mapping.MappingException;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.function.Supplier;

public final class MongoChatMessageContextReader
        implements ChatMessageContextReader {

    private static final Pattern IDENTIFIER =
            Pattern.compile("^[A-Za-z0-9_-]{1,128}$");

    private final MongoOperations mongoOperations;

    public MongoChatMessageContextReader(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public Optional<ChatMessage> findTarget(
            String messageId,
            Duration maxTime
    ) {
        requireIdentifier(messageId, "messageId");
        requireMaxTime(maxTime);
        Query query = Query.query(Criteria.where("_id").is(messageId))
                .limit(1)
                .maxTime(maxTime);
        return execute(() -> Optional.ofNullable(
                        mongoOperations.findOne(
                                query,
                                MongoChatMessageDocument.class,
                                MongoChatMessageDocument.COLLECTION_NAME))
                .map(MongoChatMessageDocument::toDomain));
    }

    @Override
    public List<ChatMessage> findBefore(
            String roomId,
            long messageVisibleAfterSequence,
            long targetRoomSequence,
            int limit,
            Duration maxTime
    ) {
        requireRange(
                roomId,
                messageVisibleAfterSequence,
                targetRoomSequence,
                limit,
                maxTime);
        Query query = Query.query(
                        Criteria.where("roomId")
                                .is(roomId)
                                .and("roomSequence")
                                .gt(messageVisibleAfterSequence)
                                .lt(targetRoomSequence))
                .with(Sort.by(Sort.Direction.DESC, "roomSequence"))
                .limit(limit)
                .maxTime(maxTime);
        return find(query);
    }

    @Override
    public List<ChatMessage> findAfter(
            String roomId,
            long targetRoomSequence,
            int limit,
            Duration maxTime
    ) {
        requireIdentifier(roomId, "roomId");
        if (targetRoomSequence < 1 || limit < 1) {
            throw new IllegalArgumentException(
                    "Context after range is invalid");
        }
        requireMaxTime(maxTime);
        Query query = Query.query(
                        Criteria.where("roomId")
                                .is(roomId)
                                .and("roomSequence")
                                .gt(targetRoomSequence))
                .with(Sort.by(Sort.Direction.ASC, "roomSequence"))
                .limit(limit)
                .maxTime(maxTime);
        return find(query);
    }

    private List<ChatMessage> find(Query query) {
        return execute(() -> mongoOperations.find(
                        query,
                        MongoChatMessageDocument.class,
                        MongoChatMessageDocument.COLLECTION_NAME)
                .stream()
                .map(MongoChatMessageDocument::toDomain)
                .toList());
    }

    private <T> T execute(Supplier<T> operation) {
        try {
            return operation.get();
        } catch (MappingException
                 | CodecConfigurationException
                 | IllegalArgumentException exception) {
            throw new ChatMessageContextReaderException(
                    ChatMessageContextReaderException.FailureKind
                            .DATA_INCONSISTENT,
                    "Message context data is malformed",
                    exception);
        } catch (RuntimeException exception) {
            throw new ChatMessageContextReaderException(
                    ChatMessageContextReaderException.FailureKind
                            .STORAGE_UNAVAILABLE,
                    "Message context storage is unavailable",
                    exception);
        }
    }

    private void requireRange(
            String roomId,
            long boundary,
            long targetSequence,
            int limit,
            Duration maxTime
    ) {
        requireIdentifier(roomId, "roomId");
        if (boundary < 0 || targetSequence <= boundary || limit < 1) {
            throw new IllegalArgumentException(
                    "Context before range is invalid");
        }
        requireMaxTime(maxTime);
    }

    private void requireIdentifier(String value, String fieldName) {
        if (value == null || !IDENTIFIER.matcher(value).matches()) {
            throw new IllegalArgumentException(
                    fieldName + " has an invalid format");
        }
    }

    private void requireMaxTime(Duration maxTime) {
        if (maxTime == null || maxTime.toNanos() < 1_000_000) {
            throw new IllegalArgumentException(
                    "maxTime must be at least 1ms");
        }
    }
}
