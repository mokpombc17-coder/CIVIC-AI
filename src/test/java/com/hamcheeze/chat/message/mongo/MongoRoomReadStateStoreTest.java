package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.room.inbox.RoomReadState;
import com.hamcheeze.chat.room.inbox.RoomReadStateAdvance;
import com.hamcheeze.chat.room.inbox.RoomInboxProperties;
import com.hamcheeze.chat.room.inbox.UnreadCount;
import com.hamcheeze.chat.room.inbox.mongo.MongoRoomReadStateDocument;
import com.hamcheeze.chat.room.inbox.mongo.MongoRoomReadStateSchemaInitializer;
import com.hamcheeze.chat.room.inbox.mongo.MongoRoomReadStateStore;
import com.hamcheeze.chat.room.inbox.mongo.MongoUnreadCountReader;
import com.hamcheeze.chat.message.MessageState;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MongoRoomReadStateStoreTest {

    private static final MongoChatMessageStoreTestConfiguration
            CONFIGURATION =
            new MongoChatMessageStoreTestConfiguration();
    private static final Instant FIRST =
            Instant.parse("2026-08-03T01:00:00Z");
    private static final Instant SECOND = FIRST.plusSeconds(1);

    private MongoRoomReadStateStore store;

    @BeforeAll
    static void startMongo() {
        CONFIGURATION.start();
    }

    @AfterAll
    static void stopMongo() {
        CONFIGURATION.close();
    }

    @BeforeEach
    void setUp() {
        CONFIGURATION.resetSchema();
        if (CONFIGURATION.mongoOperations().collectionExists(
                MongoRoomReadStateDocument.COLLECTION_NAME)) {
            CONFIGURATION.mongoOperations().dropCollection(
                    MongoRoomReadStateDocument.COLLECTION_NAME);
        }
        new MongoRoomReadStateSchemaInitializer(
                CONFIGURATION.mongoOperations()).initialize();
        store = new MongoRoomReadStateStore(
                CONFIGURATION.mongoOperations());
    }

    @Test
    void unreadCountFiltersSenderDeletionAndCountableWithTrueCap() {
        insertMessage("message-1", 1, "other", true,
                MessageState.ACTIVE);
        insertMessage("message-2", 2, "user-1", true,
                MessageState.ACTIVE);
        insertMessage("message-3", 3, "other", true,
                MessageState.DELETED_BY_AUTHOR);
        insertMessage("message-4", 4, "other", false,
                MessageState.ACTIVE);
        insertMessage("message-5", 5, "other", true,
                MessageState.ACTIVE);
        insertMessage("message-6", 6, "other", true,
                MessageState.ACTIVE);
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.setUnreadCountCap(2);
        MongoUnreadCountReader reader = new MongoUnreadCountReader(
                CONFIGURATION.mongoOperations(),
                properties,
                new SimpleMeterRegistry());

        assertThat(reader.count("room-1", "user-1", 0))
                .isEqualTo(new UnreadCount(2, true));
        assertThat(reader.count("room-1", "user-1", 1))
                .isEqualTo(new UnreadCount(2, false));
    }

    @Test
    void advancesMonotonicallyWithoutChangingNoopTimestamp() {
        RoomReadStateAdvance first = store.advance(
                "membership-1", "room-1", "user-1", 10, FIRST);
        RoomReadStateAdvance lower = store.advance(
                "membership-1", "room-1", "user-1", 5, SECOND);
        RoomReadStateAdvance higher = store.advance(
                "membership-1", "room-1", "user-1", 12, SECOND);

        assertThat(first.updated()).isTrue();
        assertThat(lower.updated()).isFalse();
        assertThat(lower.state().lastReadSequence()).isEqualTo(10);
        assertThat(lower.state().updatedAt()).isEqualTo(FIRST);
        assertThat(higher.updated()).isTrue();
        assertThat(higher.state().lastReadSequence()).isEqualTo(12);
        assertThat(higher.state().updatedAt()).isEqualTo(SECOND);
    }

    @Test
    void higherCursorDoesNotRegressStoredTimestamp() {
        RoomReadStateAdvance first = store.advance(
                "membership-1", "room-1", "user-1", 120, SECOND);
        RoomReadStateAdvance higherWithOlderTimestamp = store.advance(
                "membership-1", "room-1", "user-1", 130, FIRST);

        assertThat(first.updated()).isTrue();
        assertThat(higherWithOlderTimestamp.updated()).isTrue();
        assertThat(higherWithOlderTimestamp.state().lastReadSequence())
                .isEqualTo(130);
        assertThat(higherWithOlderTimestamp.state().updatedAt())
                .isEqualTo(SECOND);

        RoomReadState persisted = store.findByMembershipId(
                "membership-1").orElseThrow();
        assertThat(persisted.lastReadSequence()).isEqualTo(130);
        assertThat(persisted.updatedAt()).isEqualTo(SECOND);
    }

    @Test
    void concurrentInitialAdvancesConvergeToMaximum() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int iteration = 0; iteration < 50; iteration++) {
                int currentIteration = iteration;
                String membershipId = "membership-" + iteration;
                CountDownLatch start = new CountDownLatch(1);
                java.util.concurrent.Callable<RoomReadStateAdvance> lower =
                        () -> {
                            await(start);
                            return store.advance(
                                    membershipId,
                                    "room-1",
                                    "user-1-" + currentIteration,
                                    10,
                                    FIRST);
                        };
                java.util.concurrent.Callable<RoomReadStateAdvance> higher =
                        () -> {
                            await(start);
                            return store.advance(
                                    membershipId,
                                    "room-1",
                                    "user-1-" + currentIteration,
                                    20,
                                    SECOND);
                        };
                Future<RoomReadStateAdvance> first = executor.submit(
                        iteration % 2 == 0 ? lower : higher);
                Future<RoomReadStateAdvance> second = executor.submit(
                        iteration % 2 == 0 ? higher : lower);
                start.countDown();
                first.get();
                second.get();

                RoomReadState state = store.findByMembershipId(
                        membershipId).orElseThrow();
                assertThat(state.membershipId()).isEqualTo(membershipId);
                assertThat(state.roomId()).isEqualTo("room-1");
                assertThat(state.userId())
                        .isEqualTo("user-1-" + iteration);
                assertThat(state.lastReadSequence()).isEqualTo(20);
                assertThat(state.updatedAt()).isEqualTo(SECOND);
            }
        } finally {
            executor.shutdownNow();
        }
        List<Document> indexes = CONFIGURATION.mongoOperations()
                .getCollection(MongoRoomReadStateDocument.COLLECTION_NAME)
                .listIndexes(Document.class)
                .into(new ArrayList<>());
        Document index = indexes.stream()
                .filter(value -> MongoRoomReadStateSchemaInitializer
                        .USER_ROOM_INDEX_NAME.equals(
                                value.getString("name")))
                .findFirst()
                .orElseThrow();
        assertThat(index.getBoolean("unique")).isTrue();
        assertThat(index.get("key", Document.class))
                .isEqualTo(new Document("userId", 1)
                        .append("roomId", 1));
    }

    @Test
    void concurrentAdvancesConvergeToMaximumStoredCursor()
            throws Exception {
        store.advance(
                "membership-1", "room-1", "user-1", 100, FIRST);
        List<Long> requestedSequences = List.of(
                101L, 110L, 105L, 130L, 120L);
        ExecutorService executor = Executors.newFixedThreadPool(
                requestedSequences.size());
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<RoomReadStateAdvance>> futures =
                    new ArrayList<>();
            for (long requestedSequence : requestedSequences) {
                futures.add(executor.submit(() -> {
                    await(start);
                    return store.advance(
                            "membership-1",
                            "room-1",
                            "user-1",
                            requestedSequence,
                            SECOND);
                }));
            }

            start.countDown();
            for (int index = 0; index < futures.size(); index++) {
                RoomReadStateAdvance result = futures.get(index).get();
                assertThat(result.state().lastReadSequence())
                        .isGreaterThanOrEqualTo(
                                requestedSequences.get(index));
            }

            RoomReadState persisted = store.findByMembershipId(
                    "membership-1").orElseThrow();
            assertThat(persisted.lastReadSequence()).isEqualTo(130);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void uniqueUserRoomIdentityDoesNotMergeDifferentMemberships() {
        store.advance(
                "membership-1", "room-1", "user-1", 10, FIRST);

        assertThatThrownBy(() -> store.advance(
                "membership-2", "room-1", "user-1", 20, SECOND))
                .isInstanceOf(DuplicateKeyException.class);

        assertThat(store.findByMembershipId("membership-1"))
                .get()
                .extracting(RoomReadState::lastReadSequence)
                .isEqualTo(10L);
        assertThat(store.findByMembershipId("membership-2")).isEmpty();
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    private void insertMessage(
            String messageId,
            long sequence,
            String sender,
            boolean countable,
            MessageState state
    ) {
        Instant updated = state == MessageState.ACTIVE
                ? FIRST : SECOND;
        CONFIGURATION.mongoOperations().insert(
                new MongoChatMessageDocument(
                        messageId,
                        MongoChatMessageDocument.CURRENT_SCHEMA_VERSION,
                        "room-1",
                        sequence,
                        sender,
                        "client-" + sequence,
                        state == MessageState.ACTIVE
                                ? "message " + sequence : null,
                        ChatMessageContentFingerprint.of(
                                "message " + sequence),
                        state,
                        countable,
                        state == MessageState.ACTIVE ? 1L : 2L,
                        FIRST,
                        updated,
                        state == MessageState.ACTIVE ? null : updated));
    }
}
