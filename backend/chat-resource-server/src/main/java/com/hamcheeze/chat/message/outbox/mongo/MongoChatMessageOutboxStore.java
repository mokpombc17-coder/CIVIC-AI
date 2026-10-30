package com.hamcheeze.chat.message.outbox.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxBacklogSnapshot;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxEvent;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxMonitor;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxQueue;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxWriter;
import com.hamcheeze.chat.message.outbox.ClaimedChatMessageOutboxEvent;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class MongoChatMessageOutboxStore
        implements ChatMessageOutboxWriter,
        ChatMessageOutboxQueue,
        ChatMessageOutboxMonitor {

    private final MongoOperations mongoOperations;

    public MongoChatMessageOutboxStore(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public void appendMessageCreated(ChatMessage message) {
        append(ChatMessageOutboxEvent.messageCreated(message));
    }

    @Override
    public void appendMessageUpdated(ChatMessage message) {
        append(ChatMessageOutboxEvent.messageUpdated(message));
    }

    @Override
    public void appendMessageDeleted(ChatMessage message) {
        append(ChatMessageOutboxEvent.messageDeleted(message));
    }

    private void append(ChatMessageOutboxEvent event) {
        mongoOperations.insert(
                MongoChatMessageOutboxDocument.pending(
                        event),
                MongoChatMessageOutboxDocument.COLLECTION_NAME);
    }

    @Override
    public Optional<ClaimedChatMessageOutboxEvent> claimNext(
            Instant now,
            Duration claimTimeout
    ) {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(claimTimeout, "claimTimeout");
        if (claimTimeout.isZero() || claimTimeout.isNegative()) {
            throw new IllegalArgumentException(
                    "claimTimeout must be positive");
        }

        Query query = new Query(supportedCriteria()
                .and("nextAttemptAt").lte(now))
                .with(Sort.by(
                        Sort.Order.asc("nextAttemptAt"),
                        Sort.Order.asc("occurredAt"),
                        Sort.Order.asc("_id")));
        Update update = new Update()
                .inc("attemptCount", 1L)
                .set("lastAttemptAt", now)
                .set("nextAttemptAt", now.plus(claimTimeout));

        MongoChatMessageOutboxDocument claimed =
                mongoOperations.findAndModify(
                        query,
                        update,
                        FindAndModifyOptions.options().returnNew(true),
                        MongoChatMessageOutboxDocument.class,
                        MongoChatMessageOutboxDocument.COLLECTION_NAME);
        return Optional.ofNullable(claimed)
                .map(MongoChatMessageOutboxDocument::toClaimed);
    }

    @Override
    public boolean deletePublished(
            String eventId,
            long claimedAttemptCount
    ) {
        Query query = fencedQuery(eventId, claimedAttemptCount);
        return mongoOperations.remove(
                        query,
                        MongoChatMessageOutboxDocument.COLLECTION_NAME)
                .getDeletedCount() == 1;
    }

    @Override
    public boolean reschedule(
            String eventId,
            long claimedAttemptCount,
            Instant nextAttemptAt,
            String failureType
    ) {
        Objects.requireNonNull(nextAttemptAt, "nextAttemptAt");
        Objects.requireNonNull(failureType, "failureType");
        Update update = new Update()
                .set("nextAttemptAt", nextAttemptAt)
                .set("lastFailureType", failureType);
        return mongoOperations.updateFirst(
                        fencedQuery(eventId, claimedAttemptCount),
                        update,
                        MongoChatMessageOutboxDocument.COLLECTION_NAME)
                .getModifiedCount() == 1;
    }

    @Override
    public ChatMessageOutboxBacklogSnapshot sample() {
        String collection =
                MongoChatMessageOutboxDocument.COLLECTION_NAME;
        long pendingCount = mongoOperations.count(
                new Query(),
                collection);
        Query oldestQuery = new Query()
                .with(Sort.by(
                        Sort.Order.asc("occurredAt"),
                        Sort.Order.asc("_id")))
                .limit(1);
        MongoChatMessageOutboxDocument oldest =
                mongoOperations.findOne(
                        oldestQuery,
                        MongoChatMessageOutboxDocument.class,
                        collection);
        Criteria unsupported = new Criteria().norOperator(
                supportedCriteria());
        long unsupportedCount = mongoOperations.count(
                new Query(unsupported),
                collection);
        return new ChatMessageOutboxBacklogSnapshot(
                pendingCount,
                oldest == null ? null : oldest.occurredAt(),
                unsupportedCount);
    }

    private static Criteria supportedCriteria() {
        return Criteria
                .where("schemaVersion")
                .is(ChatMessageOutboxEvent.CURRENT_SCHEMA_VERSION)
                .and("aggregateType")
                .is(ChatMessageOutboxEvent.AGGREGATE_TYPE)
                .and("eventType")
                .in(ChatMessageOutboxEvent.SUPPORTED_EVENT_TYPES)
                .and("eventVersion")
                .is(ChatMessageOutboxEvent.CURRENT_EVENT_VERSION);
    }

    private static Query fencedQuery(
            String eventId,
            long claimedAttemptCount
    ) {
        Objects.requireNonNull(eventId, "eventId");
        if (claimedAttemptCount < 1) {
            throw new IllegalArgumentException(
                    "claimedAttemptCount must be at least 1");
        }
        return Query.query(
                Criteria.where("_id")
                        .is(eventId)
                        .and("attemptCount")
                        .is(claimedAttemptCount));
    }
}
