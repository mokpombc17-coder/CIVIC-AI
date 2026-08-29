package com.hamcheeze.chat.message.audit.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEventType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditRangeCursor;
import com.hamcheeze.chat.message.audit.ChatMessageAuditRangeReader;
import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import com.hamcheeze.chat.message.audit.ChatMessageAuditWriter;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class MongoChatMessageAuditStore
        implements ChatMessageAuditWriter, ChatMessageAuditReader,
        ChatMessageAuditRangeReader {

    private static final int MAX_READ_LIMIT = 1_000;

    private final MongoOperations mongoOperations;
    private final MongoRoomMessageAuditSequenceAllocator sequenceAllocator;
    private final Map<ChatMessageAuditEventType, Counter> appendedCounters =
            new EnumMap<>(ChatMessageAuditEventType.class);
    private final Counter failureCounter;
    private final Counter sequenceCounter;
    private final Counter sequenceFailureCounter;

    public MongoChatMessageAuditStore(
            MongoOperations mongoOperations,
            MeterRegistry meterRegistry
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
        this.sequenceAllocator =
                new MongoRoomMessageAuditSequenceAllocator(mongoOperations);
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        for (ChatMessageAuditEventType type
                : ChatMessageAuditEventType.values()) {
            appendedCounters.put(
                    type,
                    Counter.builder("chat.message.audit.events.appended")
                            .tag("event_type", type.name().toLowerCase())
                            .register(meterRegistry));
        }
        failureCounter = meterRegistry.counter(
                "chat.message.audit.events.failures");
        sequenceCounter = meterRegistry.counter(
                "chat.message.audit.sequence.allocated");
        sequenceFailureCounter = meterRegistry.counter(
                "chat.message.audit.sequence.failures");
    }

    @Override
    public ChatMessageAuditEvent appendCreated(
            ChatMessage created,
            String actorUserId,
            ChatMessageAuditActorType actorType
    ) {
        long sequence = allocate(created.roomId());
        return insert(ChatMessageAuditEvent.created(
                created,
                sequence,
                actorUserId,
                actorType));
    }

    @Override
    public ChatMessageAuditEvent appendUpdated(
            ChatMessage before,
            ChatMessage after,
            String actorUserId,
            ChatMessageAuditActorType actorType
    ) {
        long sequence = allocate(after.roomId());
        return insert(ChatMessageAuditEvent.updated(
                before,
                after,
                sequence,
                actorUserId,
                actorType));
    }

    @Override
    public ChatMessageAuditEvent appendDeleted(
            ChatMessage before,
            ChatMessage after,
            String actorUserId,
            ChatMessageAuditActorType actorType
    ) {
        long sequence = allocate(after.roomId());
        return insert(ChatMessageAuditEvent.deleted(
                before,
                after,
                sequence,
                actorUserId,
                actorType));
    }

    @Override
    public long currentRoomChangeSequence(String roomId) {
        requireNonBlank(roomId, "roomId");
        MongoRoomMessageAuditSequenceDocument document =
                mongoOperations.findById(
                        roomId,
                        MongoRoomMessageAuditSequenceDocument.class);
        return document == null ? 0L : document.lastSequence();
    }

    @Override
    public List<ChatMessageAuditEvent> findChanges(
            String roomId,
            long afterSequenceExclusive,
            long upToSequenceInclusive,
            int limit
    ) {
        requireNonBlank(roomId, "roomId");
        if (afterSequenceExclusive < 0
                || upToSequenceInclusive < 0
                || limit < 1
                || limit > MAX_READ_LIMIT) {
            throw new IllegalArgumentException(
                    "Invalid message audit change range");
        }
        if (upToSequenceInclusive <= afterSequenceExclusive) {
            return List.of();
        }
        Query query = Query.query(new Criteria().andOperator(
                        Criteria.where("roomId").is(roomId),
                        Criteria.where("roomChangeSequence")
                                .gt(afterSequenceExclusive)
                                .lte(upToSequenceInclusive)))
                .with(Sort.by(
                        Sort.Direction.ASC,
                        "roomChangeSequence"))
                .limit(limit);
        return mongoOperations.find(
                        query,
                        MongoChatMessageAuditEventDocument.class)
                .stream()
                .map(MongoChatMessageAuditEventDocument::toDomain)
                .toList();
    }

    @Override
    public List<ChatMessageAuditEvent> findChangesInRange(
            String roomId,
            Instant fromInclusive,
            Instant toExclusive,
            long upToSequenceInclusive,
            ChatMessageAuditRangeCursor afterExclusive,
            int limit
    ) {
        requireNonBlank(roomId, "roomId");
        Objects.requireNonNull(fromInclusive, "fromInclusive");
        Objects.requireNonNull(toExclusive, "toExclusive");
        Objects.requireNonNull(afterExclusive, "afterExclusive");
        if (!fromInclusive.isBefore(toExclusive)
                || upToSequenceInclusive < 0
                || limit < 1
                || limit > MAX_READ_LIMIT
                || afterExclusive.occurredAt().isBefore(fromInclusive)
                || !afterExclusive.occurredAt().isBefore(toExclusive)) {
            throw new IllegalArgumentException(
                    "Invalid message audit time range");
        }
        if (upToSequenceInclusive == 0) {
            return List.of();
        }
        Criteria afterCursor = new Criteria().orOperator(
                Criteria.where("occurredAt")
                        .gt(afterExclusive.occurredAt()),
                new Criteria().andOperator(
                        Criteria.where("occurredAt")
                                .is(afterExclusive.occurredAt()),
                        Criteria.where("roomChangeSequence")
                                .gt(afterExclusive
                                        .roomChangeSequence())));
        Query query = Query.query(new Criteria().andOperator(
                        Criteria.where("roomId").is(roomId),
                        Criteria.where("occurredAt")
                                .gte(fromInclusive)
                                .lt(toExclusive),
                        Criteria.where("roomChangeSequence")
                                .lte(upToSequenceInclusive),
                        afterCursor))
                .with(Sort.by(
                        Sort.Order.asc("occurredAt"),
                        Sort.Order.asc("roomChangeSequence")))
                .limit(limit);
        return mongoOperations.find(
                        query,
                        MongoChatMessageAuditEventDocument.class)
                .stream()
                .map(MongoChatMessageAuditEventDocument::toDomain)
                .toList();
    }

    private long allocate(String roomId) {
        try {
            long sequence = sequenceAllocator.next(roomId);
            BestEffortMetricRecorder.increment(
                    "chat.message.audit.sequence.allocated",
                    sequenceCounter);
            return sequence;
        } catch (RuntimeException exception) {
            BestEffortMetricRecorder.increment(
                    "chat.message.audit.sequence.failures",
                    sequenceFailureCounter);
            throw exception;
        }
    }

    private ChatMessageAuditEvent insert(ChatMessageAuditEvent event) {
        try {
            mongoOperations.insert(
                    MongoChatMessageAuditEventDocument.fromDomain(event));
            BestEffortMetricRecorder.increment(
                    "chat.message.audit.events.appended",
                    appendedCounters.get(event.eventType()));
            return event;
        } catch (RuntimeException exception) {
            BestEffortMetricRecorder.increment(
                    "chat.message.audit.events.failures",
                    failureCounter);
            throw exception;
        }
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}
