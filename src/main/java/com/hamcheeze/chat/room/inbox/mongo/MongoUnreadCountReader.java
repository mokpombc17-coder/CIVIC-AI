package com.hamcheeze.chat.room.inbox.mongo;

import com.hamcheeze.chat.message.mongo.MongoChatMessageDocument;
import com.hamcheeze.chat.message.mongo.MongoChatMessageSchemaInitializer;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.room.inbox.RoomInboxErrorCode;
import com.hamcheeze.chat.room.inbox.RoomInboxException;
import com.hamcheeze.chat.room.inbox.RoomInboxProperties;
import com.hamcheeze.chat.room.inbox.UnreadCount;
import com.hamcheeze.chat.room.inbox.UnreadCountReader;
import com.mongodb.client.model.CountOptions;
import com.mongodb.client.model.Filters;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoOperations;

import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

public final class MongoUnreadCountReader
        implements UnreadCountReader {

    private final MongoOperations mongoOperations;
    private final int cap;
    private final Duration maxTime;
    private final Counter queryCounter;
    private final Counter cappedCounter;
    private final Counter failureCounter;
    private final Timer durationTimer;

    public MongoUnreadCountReader(
            MongoOperations mongoOperations,
            RoomInboxProperties properties,
            MeterRegistry meterRegistry
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
        Objects.requireNonNull(properties, "properties");
        this.cap = properties.getUnreadCountCap();
        this.maxTime = properties.getCountQueryMaxTime();
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.queryCounter = meterRegistry.counter(
                "room.inbox.unread.count.queries");
        this.cappedCounter = meterRegistry.counter(
                "room.inbox.unread.count.capped");
        this.failureCounter = meterRegistry.counter(
                "room.inbox.unread.count.failures");
        this.durationTimer = meterRegistry.timer(
                "room.inbox.unread.count.duration");
    }

    @Override
    public UnreadCount count(
            String roomId,
            String userId,
            long readThroughSequence
    ) {
        if (readThroughSequence < 0) {
            throw new IllegalArgumentException(
                    "readThroughSequence must not be negative");
        }
        long started = System.nanoTime();
        BestEffortMetricRecorder.increment(
                "room.inbox.unread.count.queries", queryCounter);
        try {
            CountOptions options = new CountOptions()
                    .limit(cap + 1)
                    .maxTime(maxTime.toMillis(),
                            TimeUnit.MILLISECONDS)
                    .hintString(MongoChatMessageSchemaInitializer
                            .UNREAD_INDEX_NAME);
            long observed = mongoOperations.getCollection(
                            MongoChatMessageDocument.COLLECTION_NAME)
                    .countDocuments(Filters.and(
                            Filters.eq("roomId", roomId),
                            Filters.gt("roomSequence",
                                    readThroughSequence),
                            Filters.eq("state", "ACTIVE"),
                            Filters.eq("countable", true),
                            Filters.ne("senderUserId", userId)),
                            options);
            boolean capped = observed > cap;
            if (capped) {
                BestEffortMetricRecorder.increment(
                        "room.inbox.unread.count.capped",
                        cappedCounter);
            }
            return new UnreadCount(
                    (int) Math.min(observed, cap), capped);
        } catch (RuntimeException exception) {
            BestEffortMetricRecorder.increment(
                    "room.inbox.unread.count.failures",
                    failureCounter);
            throw new RoomInboxException(
                    RoomInboxErrorCode.ROOM_INBOX_UNAVAILABLE,
                    "Unread count query failed",
                    exception);
        } finally {
            BestEffortMetricRecorder.record(
                    "room.inbox.unread.count.duration",
                    durationTimer,
                    Duration.ofNanos(Math.max(
                            0, System.nanoTime() - started)));
        }
    }
}
