package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEventType;
import com.hamcheeze.chat.message.audit.mongo.MongoChatMessageAuditEventDocument;
import com.hamcheeze.chat.message.audit.mongo.MongoChatMessageAuditSchemaInitializer;
import com.hamcheeze.chat.message.audit.mongo.MongoChatMessageAuditStore;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.index.IndexInfo;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MongoChatMessageAuditStoreTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-10T01:00:00Z");
    private static final Instant UPDATED_AT =
            Instant.parse("2026-08-10T02:00:00Z");
    private static final MongoChatMessageStoreTestConfiguration
            CONFIGURATION =
            new MongoChatMessageStoreTestConfiguration();

    private MongoChatMessageAuditStore store;

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
        store = new MongoChatMessageAuditStore(
                CONFIGURATION.mongoOperations(),
                new SimpleMeterRegistry());
    }

    @Test
    void appendsAndReadsCompleteRevisionHistory() {
        ChatMessage created = active("A", 1, CREATED_AT);
        ChatMessage updated = active("B", 2, UPDATED_AT);
        ChatMessage deleted = deleted(3, UPDATED_AT.plusSeconds(1));

        store.appendCreated(
                created,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);
        store.appendUpdated(
                created,
                updated,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);
        store.appendDeleted(
                updated,
                deleted,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);

        assertThat(store.currentRoomChangeSequence("room-1"))
                .isEqualTo(3);
        List<ChatMessageAuditEvent> events = store.findChanges(
                "room-1",
                0,
                3,
                10);
        assertThat(events)
                .extracting(ChatMessageAuditEvent::eventType)
                .containsExactly(
                        ChatMessageAuditEventType.MESSAGE_CREATED,
                        ChatMessageAuditEventType.MESSAGE_UPDATED,
                        ChatMessageAuditEventType.MESSAGE_DELETED);
        assertThat(events)
                .extracting(ChatMessageAuditEvent::roomChangeSequence)
                .containsExactly(1L, 2L, 3L);
        assertThat(events.get(0).after().content()).isEqualTo("A");
        assertThat(events.get(1).before().content()).isEqualTo("A");
        assertThat(events.get(1).after().content()).isEqualTo("B");
        assertThat(events.get(2).before().content()).isEqualTo("B");
        assertThat(events.get(2).after().content()).isNull();
    }

    @Test
    void sequencesAreIndependentByRoom() {
        store.appendCreated(
                active("A", 1, CREATED_AT),
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);
        store.appendCreated(
                activeInRoom("room-2", "message-2"),
                "user-2",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);

        assertThat(store.currentRoomChangeSequence("room-1"))
                .isEqualTo(1);
        assertThat(store.currentRoomChangeSequence("room-2"))
                .isEqualTo(1);
    }

    @Test
    void transactionRollbackRemovesEventAndSequenceAllocation() {
        assertThatThrownBy(() ->
                CONFIGURATION.transactionOperations().execute(status -> {
                    store.appendCreated(
                            active("A", 1, CREATED_AT),
                            "user-1",
                            ChatMessageAuditActorType.ROOM_PARTICIPANT);
                    throw new IllegalStateException("rollback");
                }))
                .isInstanceOf(IllegalStateException.class);

        assertThat(store.currentRoomChangeSequence("room-1")).isZero();
        assertThat(store.findChanges("room-1", 0, 10, 10)).isEmpty();
    }

    @Test
    void initializerCreatesUniqueLedgerIndexesWithoutTtl() {
        List<IndexInfo> indexes = CONFIGURATION.mongoOperations()
                .indexOps(MongoChatMessageAuditEventDocument.COLLECTION_NAME)
                .getIndexInfo();

        assertThat(indexes)
                .filteredOn(index -> MongoChatMessageAuditSchemaInitializer
                        .ROOM_CHANGE_SEQUENCE_INDEX_NAME
                        .equals(index.getName()))
                .singleElement()
                .satisfies(index -> {
                    assertThat(index.isUnique()).isTrue();
                    assertThat(index.getExpireAfter()).isEmpty();
                });
        assertThat(indexes)
                .filteredOn(index -> MongoChatMessageAuditSchemaInitializer
                        .MESSAGE_VERSION_INDEX_NAME
                        .equals(index.getName()))
                .singleElement()
                .satisfies(index -> assertThat(index.isUnique()).isTrue());
    }

    private static ChatMessage active(
            String content,
            long version,
            Instant updatedAt
    ) {
        return new ChatMessage(
                "message-1",
                "room-1",
                1,
                "user-1",
                "membership-1",
                "client-1",
                content,
                MessageState.ACTIVE,
                true,
                version,
                CREATED_AT,
                updatedAt,
                null);
    }

    private static ChatMessage activeInRoom(
            String roomId,
            String messageId
    ) {
        return new ChatMessage(
                messageId,
                roomId,
                1,
                "user-2",
                "membership-2",
                "client-2",
                "content",
                MessageState.ACTIVE,
                true,
                1,
                CREATED_AT,
                CREATED_AT,
                null);
    }

    private static ChatMessage deleted(
            long version,
            Instant deletedAt
    ) {
        return new ChatMessage(
                "message-1",
                "room-1",
                1,
                "user-1",
                "membership-1",
                "client-1",
                null,
                MessageState.DELETED_BY_AUTHOR,
                true,
                version,
                CREATED_AT,
                deletedAt,
                deletedAt);
    }
}
