package com.hamcheeze.chat.room.inbox.summary.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import com.hamcheeze.chat.room.inbox.summary.SummaryWriteResult;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;

@ResourceLock("mongo-runtime-test")
class MongoRoomInboxSummaryWriterTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-04T08:30:00Z");
    private static MongoClient mongoClient;
    private static MongoOperations mongoOperations;
    private MongoRoomInboxSummaryWriter writer;

    @BeforeAll
    static void connect() {
        mongoClient = MongoClients.create(
                MongoRuntimeTestContainer.replicaSetUrl());
        mongoOperations = new MongoTemplate(
                new SimpleMongoClientDatabaseFactory(
                        mongoClient, "chat_runtime_test"));
    }

    @AfterAll
    static void disconnect() {
        mongoClient.close();
    }

    @BeforeEach
    void setUp() {
        if (mongoOperations.collectionExists(
                MongoRoomInboxSummaryDocument.COLLECTION_NAME)) {
            mongoOperations.dropCollection(
                    MongoRoomInboxSummaryDocument.COLLECTION_NAME);
        }
        new MongoRoomInboxSummarySchemaInitializer(
                mongoOperations).initialize();
        writer = new MongoRoomInboxSummaryWriter(mongoOperations);
    }

    @Test
    void initializerCreatesSparseCollectionWithoutSecondaryIndexes() {
        new MongoRoomInboxSummarySchemaInitializer(
                mongoOperations).initialize();

        assertThat(mongoOperations.collectionExists(
                MongoRoomInboxSummaryDocument.COLLECTION_NAME)).isTrue();
        assertThat(mongoOperations.count(
                new Query(),
                MongoRoomInboxSummaryDocument.COLLECTION_NAME)).isZero();
        assertThat(mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .listIndexes().into(new ArrayList<>())).hasSize(1);
    }

    @Test
    void createOnlyMovesSummaryToGreaterSequenceIncludingUncountable() {
        ChatMessage first = active(10, 1, "first", true);
        ChatMessage same = active(10, 1, "same sequence", true);
        ChatMessage lower = active(9, 1, "lower", true);
        ChatMessage greater = active(11, 1, "greater", false);

        assertThat(writer.applyCreated(first))
                .isEqualTo(SummaryWriteResult.CREATED);
        assertThat(writer.applyCreated(same))
                .isEqualTo(SummaryWriteResult.UNCHANGED);
        assertThat(writer.applyCreated(lower))
                .isEqualTo(SummaryWriteResult.UNCHANGED);
        assertThat(summary().updatedAt()).isEqualTo(first.updatedAt());
        assertThat(writer.applyCreated(greater))
                .isEqualTo(SummaryWriteResult.UPDATED);
        assertThat(summary().lastMessage().roomSequence()).isEqualTo(11);
        assertThat(summary().lastMessage().preview()).isEqualTo("greater");
    }

    @Test
    void createStoresSystemVariablePreviewAsLiteral() {
        assertThat(writer.applyCreated(active(1, 1, "$$NOW", true)))
                .isEqualTo(SummaryWriteResult.CREATED);

        assertThat(summary().lastMessage().preview()).isEqualTo("$$NOW");
    }

    @Test
    void greaterCreateStoresFieldPathPreviewAsLiteral() {
        writer.applyCreated(active(1, 1, "original", true));

        assertThat(writer.applyCreated(active(
                2,
                1,
                "$lastMessage.messageId",
                true))).isEqualTo(SummaryWriteResult.UPDATED);

        assertThat(summary().lastMessage().preview())
                .isEqualTo("$lastMessage.messageId");
    }

    @Test
    void reorderedConcurrentCreatesCannotMoveSummaryBackward()
            throws Exception {
        List<Integer> sequences = new ArrayList<>();
        for (int sequence = 1; sequence <= 20; sequence++) {
            sequences.add(sequence);
        }
        Collections.shuffle(sequences);
        List<Callable<SummaryWriteResult>> calls = sequences.stream()
                .<Callable<SummaryWriteResult>>map(sequence -> () ->
                        writer.applyCreated(active(
                                sequence,
                                1,
                                "message-" + sequence,
                                true)))
                .toList();
        try (var executor = Executors.newFixedThreadPool(8)) {
            executor.invokeAll(calls).forEach(future -> {
                try {
                    future.get();
                } catch (Exception exception) {
                    throw new AssertionError(exception);
                }
            });
        }

        assertThat(summary().lastMessage().roomSequence()).isEqualTo(20);
        assertThat(summary().lastMessage().preview())
                .isEqualTo("message-20");
    }

    @Test
    void updateOnlyChangesCurrentMessageAtGreaterVersion() {
        ChatMessage latest = active(2, 1, "latest", true);
        writer.applyCreated(latest);
        Instant lastActivityAt = summary().lastActivityAt();

        assertThat(writer.applyUpdated(active(1, 2, "past", true)))
                .isEqualTo(SummaryWriteResult.UNCHANGED);
        ChatMessage updated = active(2, 3, "edited", true);
        assertThat(writer.applyUpdated(updated))
                .isEqualTo(SummaryWriteResult.UPDATED);
        assertThat(writer.applyUpdated(active(2, 3, "same", true)))
                .isEqualTo(SummaryWriteResult.UNCHANGED);
        assertThat(writer.applyUpdated(active(2, 2, "lower", true)))
                .isEqualTo(SummaryWriteResult.UNCHANGED);

        RoomInboxSummary summary = summary();
        assertThat(summary.lastMessage().messageVersion()).isEqualTo(3);
        assertThat(summary.lastMessage().preview()).isEqualTo("edited");
        assertThat(summary.lastMessage().createdAt()).isEqualTo(CREATED_AT);
        assertThat(summary.lastActivityAt()).isEqualTo(lastActivityAt);
        assertThat(summary.updatedAt()).isEqualTo(updated.updatedAt());
    }

    @Test
    void deleteTombstonesOnlyCurrentMessageAtGreaterVersion() {
        writer.applyCreated(active(2, 1, "latest", true));
        Instant lastActivityAt = summary().lastActivityAt();

        assertThat(writer.applyDeleted(deleted(1, 2)))
                .isEqualTo(SummaryWriteResult.UNCHANGED);
        ChatMessage deleted = deleted(2, 3);
        assertThat(writer.applyDeleted(deleted))
                .isEqualTo(SummaryWriteResult.UPDATED);
        assertThat(writer.applyDeleted(deleted(2, 3)))
                .isEqualTo(SummaryWriteResult.UNCHANGED);
        assertThat(writer.applyDeleted(deleted(2, 2)))
                .isEqualTo(SummaryWriteResult.UNCHANGED);

        RoomInboxSummary summary = summary();
        assertThat(summary.lastMessage().state())
                .isEqualTo(MessageState.DELETED_BY_AUTHOR);
        assertThat(summary.lastMessage().preview()).isNull();
        assertThat(summary.lastMessage().previewTruncated()).isFalse();
        assertThat(summary.lastMessage().createdAt()).isEqualTo(CREATED_AT);
        assertThat(summary.lastActivityAt()).isEqualTo(lastActivityAt);
        assertThat(summary.updatedAt()).isEqualTo(deleted.updatedAt());
    }

    private RoomInboxSummary summary() {
        return mongoOperations.findById(
                        "room-1",
                        MongoRoomInboxSummaryDocument.class,
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .toDomain();
    }

    private static ChatMessage active(
            long sequence,
            long version,
            String content,
            boolean countable
    ) {
        Instant updatedAt = CREATED_AT.plusSeconds(version - 1);
        return new ChatMessage(
                "message-" + sequence,
                "room-1",
                sequence,
                "user-1",
                "membership-1",
                "client-" + sequence,
                content,
                MessageState.ACTIVE,
                countable,
                version,
                CREATED_AT,
                updatedAt,
                null);
    }

    private static ChatMessage deleted(long sequence, long version) {
        Instant updatedAt = CREATED_AT.plusSeconds(
                Math.max(1, version - 1));
        return new ChatMessage(
                "message-" + sequence,
                "room-1",
                sequence,
                "user-1",
                "membership-1",
                "client-" + sequence,
                null,
                MessageState.DELETED_BY_AUTHOR,
                true,
                version,
                CREATED_AT,
                updatedAt,
                updatedAt);
    }
}
