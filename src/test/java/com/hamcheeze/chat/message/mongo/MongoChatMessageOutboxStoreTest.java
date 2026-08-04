package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxBacklogSnapshot;
import com.hamcheeze.chat.message.outbox.ClaimedChatMessageOutboxEvent;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxDocument;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxSchemaInitializer;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxStore;
import com.mongodb.client.MongoCollection;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MongoChatMessageOutboxStoreTest {

    private static final Instant NOW =
            Instant.parse("2026-07-30T05:00:00Z");
    private static final MongoChatMessageStoreTestConfiguration
            CONFIGURATION =
            new MongoChatMessageStoreTestConfiguration();

    private MongoChatMessageOutboxStore store;

    @BeforeAll
    static void startMongoDB() {
        CONFIGURATION.start();
    }

    @AfterAll
    static void stopMongoDB() {
        CONFIGURATION.close();
    }

    @BeforeEach
    void setUp() {
        CONFIGURATION.resetSchema();
        store = new MongoChatMessageOutboxStore(
                CONFIGURATION.mongoOperations());
    }

    @Test
    void claimUsesSupportedContractAndFencingToken() {
        insertUnsupported();
        store.appendMessageCreated(message("message-1", 1L, NOW));

        ClaimedChatMessageOutboxEvent claimed =
                store.claimNext(NOW, Duration.ofSeconds(30))
                        .orElseThrow();

        assertThat(claimed.eventId())
                .isEqualTo("chat-message-created:message-1");
        assertThat(claimed.claimedAttemptCount()).isEqualTo(1L);
        assertThat(claimed.decodeEnvelope().payload().messageId())
                .isEqualTo("message-1");

        Document claimedDocument = events().find(
                        new Document(
                                "_id",
                                "chat-message-created:message-1"))
                .first();
        assertThat(claimedDocument).isNotNull();
        assertThat(claimedDocument.getLong("attemptCount"))
                .isEqualTo(1L);
        assertThat(claimedDocument.getDate("lastAttemptAt").toInstant())
                .isEqualTo(NOW);
        assertThat(claimedDocument.getDate("nextAttemptAt").toInstant())
                .isEqualTo(NOW.plusSeconds(30));

        Document unsupported = events().find(
                        new Document("_id", "unsupported-1"))
                .first();
        assertThat(unsupported).isNotNull();
        assertThat(unsupported.getLong("attemptCount")).isZero();
        assertThat(unsupported.get("lastAttemptAt")).isNull();
    }

    @Test
    void claimOrdersByAttemptTimeOccurrenceAndId() {
        store.appendMessageCreated(message(
                "message-b",
                2L,
                NOW.minusSeconds(1)));
        store.appendMessageCreated(message(
                "message-a",
                1L,
                NOW.minusSeconds(1)));
        store.appendMessageCreated(message(
                "message-c",
                3L,
                NOW));

        assertThat(claimId())
                .isEqualTo("chat-message-created:message-a");
        assertThat(claimId())
                .isEqualTo("chat-message-created:message-b");
        assertThat(claimId())
                .isEqualTo("chat-message-created:message-c");
    }

    @Test
    void deleteAndRescheduleRejectSupersededAttempt() {
        store.appendMessageCreated(message("message-1", 1L, NOW));
        ClaimedChatMessageOutboxEvent claimed =
                store.claimNext(NOW, Duration.ofSeconds(30))
                        .orElseThrow();

        assertThat(store.deletePublished(
                claimed.eventId(),
                claimed.claimedAttemptCount() + 1)).isFalse();
        assertThat(store.reschedule(
                claimed.eventId(),
                claimed.claimedAttemptCount() + 1,
                NOW.plusSeconds(5),
                "PUBLISH_FAILED")).isFalse();
        assertThat(store.reschedule(
                claimed.eventId(),
                claimed.claimedAttemptCount(),
                NOW.plusSeconds(5),
                "PUBLISH_FAILED")).isTrue();

        assertThat(store.claimNext(
                NOW.plusSeconds(4),
                Duration.ofSeconds(30))).isEmpty();
        ClaimedChatMessageOutboxEvent reclaimed =
                store.claimNext(
                                NOW.plusSeconds(5),
                                Duration.ofSeconds(30))
                        .orElseThrow();
        assertThat(reclaimed.claimedAttemptCount()).isEqualTo(2L);
        assertThat(store.deletePublished(
                reclaimed.eventId(),
                reclaimed.claimedAttemptCount())).isTrue();
        assertThat(events().countDocuments()).isZero();
    }

    @Test
    void abandonedClaimBecomesAvailableAfterClaimTimeout() {
        store.appendMessageCreated(message("message-1", 1L, NOW));
        ClaimedChatMessageOutboxEvent first =
                store.claimNext(NOW, Duration.ofSeconds(30))
                        .orElseThrow();

        assertThat(store.claimNext(
                NOW.plusSeconds(29),
                Duration.ofSeconds(30))).isEmpty();
        ClaimedChatMessageOutboxEvent reclaimed =
                store.claimNext(
                                NOW.plusSeconds(30),
                                Duration.ofSeconds(30))
                        .orElseThrow();

        assertThat(first.claimedAttemptCount()).isEqualTo(1L);
        assertThat(reclaimed.eventId()).isEqualTo(first.eventId());
        assertThat(reclaimed.claimedAttemptCount()).isEqualTo(2L);
    }

    @Test
    void malformedSupportedPayloadIsClaimedButDecodeFails() {
        events().insertOne(supportedDocument(
                "malformed-1",
                NOW,
                supportedPayload().append("countable", null)));

        ClaimedChatMessageOutboxEvent claimed =
                store.claimNext(NOW, Duration.ofSeconds(30))
                        .orElseThrow();

        assertThatThrownBy(claimed::decodeEnvelope)
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void backlogIncludesUnsupportedAndUsesOldestOccurrence() {
        store.appendMessageCreated(message("message-1", 1L, NOW));
        insertUnsupported();

        ChatMessageOutboxBacklogSnapshot snapshot = store.sample();

        assertThat(snapshot.pendingCount()).isEqualTo(2L);
        assertThat(snapshot.unsupportedCount()).isEqualTo(1L);
        assertThat(snapshot.oldestOccurredAt())
                .isEqualTo(NOW.minusSeconds(10));
    }

    @Test
    void initializerCreatesDispatchAndOldestIndexes() {
        new MongoChatMessageOutboxSchemaInitializer(
                CONFIGURATION.mongoOperations()).initialize();

        List<Document> indexes = events()
                .listIndexes(Document.class)
                .into(new ArrayList<>());
        assertThat(indexes).extracting(index ->
                        index.getString("name"))
                .contains(
                        MongoChatMessageOutboxSchemaInitializer
                                .DISPATCH_INDEX_NAME,
                        MongoChatMessageOutboxSchemaInitializer
                                .OLDEST_INDEX_NAME);
        Document dispatch = indexes.stream()
                .filter(index ->
                        MongoChatMessageOutboxSchemaInitializer
                                .DISPATCH_INDEX_NAME
                                .equals(index.getString("name")))
                .findFirst()
                .orElseThrow();
        assertThat(dispatch.get("key", Document.class))
                .isEqualTo(new Document("schemaVersion", 1)
                        .append("aggregateType", 1)
                        .append("eventType", 1)
                        .append("eventVersion", 1)
                        .append("nextAttemptAt", 1)
                        .append("occurredAt", 1)
                        .append("_id", 1));
    }

    private String claimId() {
        return store.claimNext(NOW, Duration.ofMinutes(1))
                .orElseThrow()
                .eventId();
    }

    private void insertUnsupported() {
        events().insertOne(new Document("_id", "unsupported-1")
                .append("schemaVersion", 1)
                .append("aggregateType", "CHAT_MESSAGE")
                .append("eventType", "CHAT_MESSAGE_CREATED")
                .append("eventVersion", 1)
                .append("occurredAt",
                        java.util.Date.from(NOW.minusSeconds(10)))
                .append("nextAttemptAt", java.util.Date.from(NOW))
                .append("attemptCount", 0L));
    }

    private Document supportedDocument(
            String eventId,
            Instant occurredAt,
            Document payload
    ) {
        return new Document("_id", eventId)
                .append("schemaVersion", 2)
                .append("aggregateType", "CHAT_MESSAGE")
                .append("aggregateId", "message-1")
                .append("eventType", "CHAT_MESSAGE_CREATED")
                .append("eventVersion", 1)
                .append("roomId", "room-1")
                .append("roomSequence", 1L)
                .append("payload", payload)
                .append("occurredAt",
                        java.util.Date.from(occurredAt))
                .append("attemptCount", 0L)
                .append("nextAttemptAt",
                        java.util.Date.from(occurredAt));
    }

    private Document supportedPayload() {
        return new Document("messageId", "message-1")
                .append("roomId", "room-1")
                .append("roomSequence", 1L)
                .append("senderUserId", "user-1")
                .append("clientMessageId", "client-1")
                .append("content", "hello")
                .append("state", "ACTIVE")
                .append("countable", true)
                .append("messageVersion", 1L)
                .append("createdAt", java.util.Date.from(NOW))
                .append("updatedAt", java.util.Date.from(NOW))
                .append("deletedAt", null);
    }

    private ChatMessage message(
            String messageId,
            long sequence,
            Instant createdAt
    ) {
        return new ChatMessage(
                messageId,
                "room-1",
                sequence,
                "user-1",
                "client-" + sequence,
                "hello",
                createdAt);
    }

    private MongoCollection<Document> events() {
        return CONFIGURATION.mongoOperations().getCollection(
                MongoChatMessageOutboxDocument.COLLECTION_NAME);
    }
}
