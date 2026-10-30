package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.search.ChatMessageSearchCandidateSlice;
import com.hamcheeze.chat.message.search.ChatMessageSearchReader;
import com.hamcheeze.chat.message.search.ChatMessageSearchReaderException;
import org.bson.codecs.configuration.CodecConfigurationException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mapping.MappingException;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

public final class MongoChatMessageSearchReader
        implements ChatMessageSearchReader {

    private static final Pattern ROOM_ID =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private final MongoOperations mongoOperations;

    public MongoChatMessageSearchReader(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public ChatMessageSearchCandidateSlice findCandidates(
            String roomId,
            long messageVisibleAfterSequence,
            long searchUpperBoundSequence,
            Long beforeSequence,
            int limit,
            Duration maxTime
    ) {
        requireInputs(
                roomId,
                messageVisibleAfterSequence,
                searchUpperBoundSequence,
                beforeSequence,
                limit,
                maxTime);

        Criteria criteria = Criteria.where("roomId")
                .is(roomId)
                .and("state")
                .is(MessageState.ACTIVE)
                .and("countable")
                .is(true)
                .and("roomSequence")
                .gt(messageVisibleAfterSequence)
                .lte(searchUpperBoundSequence);
        if (beforeSequence != null) {
            criteria = criteria.lt(beforeSequence);
        }
        Query query = Query.query(criteria)
                .with(Sort.by(
                        Sort.Direction.DESC,
                        "roomSequence"))
                .limit(limit + 1)
                .maxTime(maxTime);

        List<ChatMessage> found;
        try {
            found = mongoOperations.find(
                            query,
                            MongoChatMessageDocument.class,
                            MongoChatMessageDocument.COLLECTION_NAME)
                    .stream()
                    .map(MongoChatMessageDocument::toDomain)
                    .toList();
        } catch (MappingException
                 | CodecConfigurationException
                 | IllegalArgumentException exception) {
            throw new ChatMessageSearchReaderException(
                    ChatMessageSearchReaderException.FailureKind
                            .DATA_INCONSISTENT,
                    "Message search candidate is malformed",
                    exception);
        } catch (RuntimeException exception) {
            throw new ChatMessageSearchReaderException(
                    ChatMessageSearchReaderException.FailureKind
                            .STORAGE_UNAVAILABLE,
                    "Message search storage is unavailable",
                    exception);
        }
        boolean hasOlderCandidates = found.size() > limit;
        List<ChatMessage> items = hasOlderCandidates
                ? List.copyOf(found.subList(0, limit))
                : found;
        return new ChatMessageSearchCandidateSlice(
                items,
                hasOlderCandidates);
    }

    private void requireInputs(
            String roomId,
            long messageVisibleAfterSequence,
            long searchUpperBoundSequence,
            Long beforeSequence,
            int limit,
            Duration maxTime
    ) {
        if (roomId == null || !ROOM_ID.matcher(roomId).matches()) {
            throw new IllegalArgumentException(
                    "roomId has an invalid format");
        }
        if (messageVisibleAfterSequence < 0
                || searchUpperBoundSequence
                < messageVisibleAfterSequence) {
            throw new IllegalArgumentException(
                    "search sequence range is invalid");
        }
        if (beforeSequence != null
                && (beforeSequence
                <= messageVisibleAfterSequence
                || beforeSequence > searchUpperBoundSequence)) {
            throw new IllegalArgumentException(
                    "beforeSequence is out of range");
        }
        if (limit < 1 || limit == Integer.MAX_VALUE) {
            throw new IllegalArgumentException(
                    "limit is out of range");
        }
        if (maxTime == null
                || maxTime.toNanos() < 1_000_000) {
            throw new IllegalArgumentException(
                    "maxTime must be at least 1ms");
        }
    }
}
