package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import com.hamcheeze.chat.message.ConflictingChatMessage;
import com.hamcheeze.chat.message.DuplicateChatMessage;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoreChatMessageResult;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.metrics.ThrowingMeterRegistry;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.IndexOptions;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MongoChatMessageStoreTest {

    private static final Instant NOW =
            Instant.parse("2026-07-27T05:00:00Z");
    private static final Clock CLOCK =
            Clock.fixed(NOW, ZoneOffset.UTC);
    private static final MongoChatMessageStoreTestConfiguration
            CONFIGURATION =
            new MongoChatMessageStoreTestConfiguration();

    private AtomicInteger generatedIds;
    private SimpleMeterRegistry meterRegistry;
    private MongoChatMessageStore store;

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
        generatedIds = new AtomicInteger();
        meterRegistry = new SimpleMeterRegistry();
        store = newStore(() ->
                "message-" + generatedIds.incrementAndGet());
    }

    @Test
    void storesNewMessageDocument() {
        StoredChatMessage stored =
                (StoredChatMessage) store.append(
                        message(
                                "room-1",
                                "user-1",
                                "client-1",
                                "normalized content"));

        assertThat(stored.message().messageId())
                .isEqualTo("message-1");
        assertThat(stored.message().roomSequence()).isEqualTo(1L);
        assertThat(stored.message().createdAt()).isEqualTo(NOW);
        assertThat(stored.message().content())
                .isEqualTo("normalized content");

        Document document = messages().find().first();
        assertThat(document).isNotNull();
        assertThat(document.get("_id")).isEqualTo("message-1");
        assertThat(document.getInteger("schemaVersion")).isEqualTo(1);
        assertThat(document.getLong("roomSequence")).isEqualTo(1L);
        assertThat(document.getString("senderUserId"))
                .isEqualTo("user-1");
        assertThat(document.getString("content"))
                .isEqualTo("normalized content");
        assertThat(document.getDate("createdAt").toInstant())
                .isEqualTo(NOW);
        assertThat(messages().countDocuments()).isEqualTo(1L);
    }

    @Test
    void assignsSequentialNumbersWithinRoom() {
        StoredChatMessage first =
                (StoredChatMessage) store.append(
                        message("room-1", "user-1", "client-1", "one"));
        StoredChatMessage second =
                (StoredChatMessage) store.append(
                        message("room-1", "user-1", "client-2", "two"));

        assertThat(first.message().roomSequence()).isEqualTo(1L);
        assertThat(second.message().roomSequence()).isEqualTo(2L);
    }

    @Test
    void assignsIndependentSequencesByRoom() {
        StoredChatMessage first =
                (StoredChatMessage) store.append(
                        message("room-1", "user-1", "client-1", "one"));
        StoredChatMessage second =
                (StoredChatMessage) store.append(
                        message("room-2", "user-1", "client-1", "two"));

        assertThat(first.message().roomSequence()).isEqualTo(1L);
        assertThat(second.message().roomSequence()).isEqualTo(1L);
    }

    @Test
    void sameKeyAndContentReturnsDuplicateWithoutConsumingSequence() {
        StoredChatMessage first =
                (StoredChatMessage) store.append(
                        message("room-1", "user-1", "client-1", "hello"));
        DuplicateChatMessage duplicate =
                (DuplicateChatMessage) store.append(
                        message("room-1", "user-1", "client-1", "hello"));
        StoredChatMessage next =
                (StoredChatMessage) store.append(
                        message("room-1", "user-1", "client-2", "next"));

        assertThat(duplicate.message()).isEqualTo(first.message());
        assertThat(next.message().roomSequence()).isEqualTo(2L);
        assertThat(messages().countDocuments()).isEqualTo(2L);
    }

    @Test
    void sameKeyAndDifferentContentReturnsConflictWithoutSequenceUse() {
        StoredChatMessage first =
                (StoredChatMessage) store.append(
                        message("room-1", "user-1", "client-1", "hello"));
        ConflictingChatMessage conflict =
                (ConflictingChatMessage) store.append(
                        message("room-1", "user-1", "client-1", "changed"));
        StoredChatMessage next =
                (StoredChatMessage) store.append(
                        message("room-1", "user-1", "client-2", "next"));

        assertThat(conflict.existingMessage()).isEqualTo(first.message());
        assertThat(next.message().roomSequence()).isEqualTo(2L);
        assertThat(messages().countDocuments()).isEqualTo(2L);
    }

    @Test
    void sameClientMessageIdIsIndependentBySender() {
        StoreChatMessageResult first = store.append(
                message("room-1", "user-1", "client-1", "one"));
        StoreChatMessageResult second = store.append(
                message("room-1", "user-2", "client-1", "two"));

        assertThat(first).isInstanceOf(StoredChatMessage.class);
        assertThat(second).isInstanceOf(StoredChatMessage.class);
        assertThat(messages().countDocuments()).isEqualTo(2L);
    }

    @Test
    void sameClientMessageIdIsIndependentByRoom() {
        StoreChatMessageResult first = store.append(
                message("room-1", "user-1", "client-1", "one"));
        StoreChatMessageResult second = store.append(
                message("room-2", "user-1", "client-1", "two"));

        assertThat(first).isInstanceOf(StoredChatMessage.class);
        assertThat(second).isInstanceOf(StoredChatMessage.class);
        assertThat(messages().countDocuments()).isEqualTo(2L);
    }

    @Test
    void concurrentSameKeyStoresOnceAndConsumesOneSequence()
            throws Exception {
        int requestCount = 6;
        List<Callable<StoreChatMessageResult>> calls =
                repeatedCalls(
                        requestCount,
                        index -> message(
                                "room-1",
                                "user-1",
                                "client-1",
                                "hello"));

        List<StoreChatMessageResult> results =
                runConcurrently(calls);

        assertThat(results.stream()
                .filter(StoredChatMessage.class::isInstance))
                .hasSize(1);
        assertThat(results.stream()
                .filter(DuplicateChatMessage.class::isInstance))
                .hasSize(requestCount - 1);
        assertThat(messages().countDocuments()).isEqualTo(1L);
        assertThat(lastSequence("room-1")).isEqualTo(1L);
    }

    @Test
    void concurrentDifferentContentForSameKeyStoresOneWinner()
            throws Exception {
        int requestCount = 6;
        List<Callable<StoreChatMessageResult>> calls =
                repeatedCalls(
                        requestCount,
                        index -> message(
                                "room-1",
                                "user-1",
                                "client-1",
                                "content-" + index));

        List<StoreChatMessageResult> results =
                runConcurrently(calls);

        assertThat(results.stream()
                .filter(StoredChatMessage.class::isInstance))
                .hasSize(1);
        assertThat(results.stream()
                .filter(ConflictingChatMessage.class::isInstance))
                .hasSize(requestCount - 1);
        assertThat(messages().countDocuments()).isEqualTo(1L);
        assertThat(lastSequence("room-1")).isEqualTo(1L);
    }

    @Test
    void parallelMessagesInSameRoomHaveGaplessUniqueSequences()
            throws Exception {
        int requestCount = 6;
        List<Callable<StoreChatMessageResult>> calls =
                repeatedCalls(
                        requestCount,
                        index -> message(
                                "room-1",
                                "user-" + index,
                                "client-" + index,
                                "content-" + index));

        List<StoreChatMessageResult> results =
                new ArrayList<>();
        for (int offset = 0;
             offset < requestCount;
             offset += 2) {
            results.addAll(runConcurrently(
                    calls.subList(offset, offset + 2)));
        }
        Set<Long> sequences = new HashSet<>();
        for (StoreChatMessageResult result : results) {
            assertThat(result).isInstanceOf(StoredChatMessage.class);
            sequences.add(
                    ((StoredChatMessage) result)
                            .message()
                            .roomSequence());
        }

        assertThat(sequences).containsExactlyInAnyOrder(
                1L, 2L, 3L, 4L, 5L, 6L);
        assertThat(messages().countDocuments())
                .isEqualTo(requestCount);
    }

    @Test
    void messageIdCollisionRollsBackSequenceIncrement() {
        MongoChatMessageStore fixedIdStore =
                newStore(() -> "fixed-id");
        fixedIdStore.append(
                message("room-1", "user-1", "client-1", "first"));

        assertThatThrownBy(() -> fixedIdStore.append(
                message("room-1", "user-1", "client-2", "collision")))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> assertThat(
                        ((ChatMessageStoreException) exception).kind())
                        .isEqualTo(
                                ChatMessageStoreFailureKind.PERMANENT));

        MongoChatMessageStore nextIdStore =
                newStore(() -> "next-id");
        StoredChatMessage next =
                (StoredChatMessage) nextIdStore.append(
                        message(
                                "room-1",
                                "user-1",
                                "client-3",
                                "after failure"));

        assertThat(next.message().roomSequence()).isEqualTo(2L);
        assertThat(lastSequence("room-1")).isEqualTo(2L);
    }

    @Test
    void recreatedStoreKeepsDatabaseIdempotency() {
        StoredChatMessage first =
                (StoredChatMessage) store.append(
                        message("room-1", "user-1", "client-1", "hello"));

        MongoChatMessageStore recreated =
                newStore(() -> "new-process-message-id");
        DuplicateChatMessage duplicate =
                (DuplicateChatMessage) recreated.append(
                        message("room-1", "user-1", "client-1", "hello"));

        assertThat(duplicate.message()).isEqualTo(first.message());
        assertThat(messages().countDocuments()).isEqualTo(1L);
    }

    @Test
    void storedCounterAndDurationFailuresDoNotChangeStoredResult() {
        MongoChatMessageStore metricFailingStore =
                CONFIGURATION.store(
                        CLOCK,
                        () -> "message-with-metric-failure",
                        ThrowingMeterRegistry.counterAndTimer(
                                "chat.message.store.stored",
                                "chat.message.store.append.duration"));

        assertThat(metricFailingStore.append(
                message("room-1", "user-1", "client-1", "hello")))
                .isInstanceOf(StoredChatMessage.class);
        assertThat(messages().countDocuments()).isEqualTo(1L);
    }

    @Test
    void duplicateCounterFailureDoesNotChangeDuplicateResult() {
        store.append(
                message("room-1", "user-1", "client-1", "hello"));
        MongoChatMessageStore metricFailingStore =
                CONFIGURATION.store(
                        CLOCK,
                        () -> "unused-message-id",
                        ThrowingMeterRegistry.counter(
                                "chat.message.store.duplicate"));

        assertThat(metricFailingStore.append(
                message("room-1", "user-1", "client-1", "hello")))
                .isInstanceOf(DuplicateChatMessage.class);
        assertThat(messages().countDocuments()).isEqualTo(1L);
    }

    @Test
    void conflictCounterFailureDoesNotChangeConflictResult() {
        store.append(
                message("room-1", "user-1", "client-1", "hello"));
        MongoChatMessageStore metricFailingStore =
                CONFIGURATION.store(
                        CLOCK,
                        () -> "unused-message-id",
                        ThrowingMeterRegistry.counter(
                                "chat.message.store.conflicts"));

        assertThat(metricFailingStore.append(
                message("room-1", "user-1", "client-1", "changed")))
                .isInstanceOf(ConflictingChatMessage.class);
        assertThat(messages().countDocuments()).isEqualTo(1L);
    }

    @Test
    void failureCounterFailureDoesNotReplaceStoreFailure() {
        MongoChatMessageStore fixedIdStore =
                newStore(() -> "fixed-id");
        fixedIdStore.append(
                message("room-1", "user-1", "client-1", "first"));
        MongoChatMessageStore metricFailingStore =
                CONFIGURATION.store(
                        CLOCK,
                        () -> "fixed-id",
                        ThrowingMeterRegistry.counter(
                                "chat.message.store.failures"));

        assertThatThrownBy(() -> metricFailingStore.append(
                message("room-1", "user-1", "client-2", "collision")))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> assertThat(
                        ((ChatMessageStoreException) exception).kind())
                        .isEqualTo(
                                ChatMessageStoreFailureKind.PERMANENT));
    }

    @Test
    void initializerCreatesRequiredCollectionsAndIndexes() {
        MongoChatMessageSchemaInitializer initializer =
                CONFIGURATION.schemaInitializer();

        initializer.initialize();
        initializer.initialize();

        assertThat(CONFIGURATION.mongoOperations().collectionExists(
                MongoChatMessageDocument.COLLECTION_NAME)).isTrue();
        assertThat(CONFIGURATION.mongoOperations().collectionExists(
                MongoRoomSequenceDocument.COLLECTION_NAME)).isTrue();

        List<Document> indexes = messages()
                .listIndexes(Document.class)
                .into(new ArrayList<>());
        assertRequiredIndex(
                indexes,
                MongoChatMessageSchemaInitializer
                        .IDEMPOTENCY_INDEX_NAME,
                new Document("roomId", 1)
                        .append("senderUserId", 1)
                        .append("clientMessageId", 1));
        assertRequiredIndex(
                indexes,
                MongoChatMessageSchemaInitializer
                        .ROOM_SEQUENCE_INDEX_NAME,
                new Document("roomId", 1)
                        .append("roomSequence", 1));
        assertThat(indexes).hasSize(3);
    }

    @Test
    void initializerFailsWhenNamedIndexHasWrongContract() {
        CONFIGURATION.mongoOperations().dropCollection(
                MongoChatMessageDocument.COLLECTION_NAME);
        CONFIGURATION.mongoOperations().createCollection(
                MongoChatMessageDocument.COLLECTION_NAME);
        messages().createIndex(
                new Document("roomId", 1),
                new IndexOptions()
                        .name(MongoChatMessageSchemaInitializer
                                .IDEMPOTENCY_INDEX_NAME)
                        .unique(false));

        assertThatThrownBy(() ->
                CONFIGURATION.schemaInitializer().initialize())
                .isInstanceOf(DataAccessException.class);
    }

    private MongoChatMessageStore newStore(
            Supplier<String> messageIdGenerator
    ) {
        return CONFIGURATION.store(
                CLOCK,
                messageIdGenerator,
                meterRegistry);
    }

    private NewChatMessage message(
            String roomId,
            String senderUserId,
            String clientMessageId,
            String content
    ) {
        return new NewChatMessage(
                roomId,
                senderUserId,
                clientMessageId,
                content);
    }

    private MongoCollection<Document> messages() {
        return CONFIGURATION.mongoOperations().getCollection(
                MongoChatMessageDocument.COLLECTION_NAME);
    }

    private long lastSequence(String roomId) {
        Document sequence = CONFIGURATION
                .mongoOperations()
                .getCollection(
                        MongoRoomSequenceDocument.COLLECTION_NAME)
                .find(new Document("_id", roomId))
                .first();
        assertThat(sequence).isNotNull();
        return sequence.getLong("lastSequence");
    }

    private List<Callable<StoreChatMessageResult>> repeatedCalls(
            int count,
            java.util.function.IntFunction<NewChatMessage> factory
    ) {
        List<Callable<StoreChatMessageResult>> calls =
                new ArrayList<>();
        for (int index = 0; index < count; index++) {
            NewChatMessage message = factory.apply(index);
            calls.add(() -> store.append(message));
        }
        return calls;
    }

    private List<StoreChatMessageResult> runConcurrently(
            List<Callable<StoreChatMessageResult>> calls
    ) throws Exception {
        return runConcurrently(calls, calls.size());
    }

    private List<StoreChatMessageResult> runConcurrently(
            List<Callable<StoreChatMessageResult>> calls,
            int maxConcurrency
    ) throws Exception {
        ExecutorService executor =
                Executors.newFixedThreadPool(maxConcurrency);
        CountDownLatch ready = new CountDownLatch(maxConcurrency);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<StoreChatMessageResult>> futures =
                    new ArrayList<>();
            for (Callable<StoreChatMessageResult> call : calls) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(5, TimeUnit.SECONDS)) {
                        throw new IllegalStateException(
                                "Concurrent test start timed out");
                    }
                    return call.call();
                }));
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<StoreChatMessageResult> results =
                    new ArrayList<>();
            for (Future<StoreChatMessageResult> future : futures) {
                try {
                    results.add(future.get(20, TimeUnit.SECONDS));
                } catch (ExecutionException exception) {
                    Throwable cause = exception.getCause();
                    if (cause instanceof Exception checked) {
                        throw checked;
                    }
                    throw exception;
                }
            }
            return results;
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }

    private void assertRequiredIndex(
            List<Document> indexes,
            String name,
            Document keys
    ) {
        Document index = indexes.stream()
                .filter(candidate ->
                        name.equals(candidate.getString("name")))
                .findFirst()
                .orElseThrow();
        assertThat(index.get("key", Document.class)).isEqualTo(keys);
        assertThat(index.getBoolean("unique", false)).isTrue();
        assertThat(index.containsKey("sparse")).isFalse();
        assertThat(index.containsKey("partialFilterExpression"))
                .isFalse();
    }
}
