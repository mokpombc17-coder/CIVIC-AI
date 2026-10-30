package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.ChatMessageMutationResult;
import com.hamcheeze.chat.message.ChatMessageMutationStore;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.DeleteChatMessageMutation;
import com.hamcheeze.chat.message.DuplicateChatMessage;
import com.hamcheeze.chat.message.ConflictingChatMessage;
import com.hamcheeze.chat.message.EditChatMessageMutation;
import com.hamcheeze.chat.message.MessageMutationOutcome;
import com.hamcheeze.chat.message.MessageMutationCommandType;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEventType;
import com.hamcheeze.chat.message.audit.mongo.MongoChatMessageAuditEventDocument;
import com.hamcheeze.chat.message.audit.mongo.MongoChatMessageAuditStore;
import com.hamcheeze.chat.message.audit.mongo.MongoRoomMessageAuditSequenceDocument;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxWriter;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxDocument;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxStore;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummaryWriter;
import com.hamcheeze.chat.room.inbox.summary.SummaryWriteResult;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.mongodb.MongoException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MongoChatMessageMutationStoreTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-31T01:00:00Z");
    private static final Instant MUTATED_AT =
            Instant.parse("2026-07-31T02:00:00Z");
    private static final MongoChatMessageStoreTestConfiguration
            CONFIGURATION =
            new MongoChatMessageStoreTestConfiguration();

    private MongoChatMessageStore messageStore;
    private ChatMessageMutationStore mutationStore;

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
        messageStore = CONFIGURATION.store(
                Clock.fixed(CREATED_AT, ZoneOffset.UTC),
                () -> "message-1",
                new SimpleMeterRegistry());
        mutationStore = CONFIGURATION.mutationStore(
                Clock.fixed(MUTATED_AT, ZoneOffset.UTC),
                new MongoChatMessageOutboxStore(
                        CONFIGURATION.mongoOperations()),
                new SimpleMeterRegistry());
    }

    @Test
    void editsReplaysDeletesAndKeepsCreationSequence() {
        ChatMessage created = create("message-client-1");
        clearOutbox();
        String editId = UUID.randomUUID().toString();

        ChatMessageMutationResult updated = mutationStore.edit(
                new EditChatMessageMutation(
                        "user-1",
                        editId,
                        "room-1",
                        created.messageId(),
                        "edited"));

        assertThat(updated.outcome())
                .isEqualTo(MessageMutationOutcome.UPDATED);
        assertThat(updated.roomSequence()).isEqualTo(1);
        assertThat(updated.messageVersion()).isEqualTo(2);
        assertThat(updated.messageState())
                .isEqualTo(MessageState.ACTIVE);
        assertThat(message().content()).isEqualTo("edited");
        assertThat(message().retainedContent()).isNull();
        assertThat(message().roomSequence()).isEqualTo(1);
        assertThat(message().senderMembershipId())
                .isEqualTo("membership-1");
        assertThat(message().schemaVersion()).isEqualTo(5);
        assertThat(message().senderMembershipId())
                .isEqualTo("membership-1");
        assertThat(message().countable()).isTrue();
        assertThat(outboxCount()).isEqualTo(1);
        assertThat(outboxId())
                .isEqualTo("chat-message-updated:message-1:v2");
        assertThat(summary().lastMessage().messageVersion()).isEqualTo(2);
        assertThat(summary().lastMessage().preview()).isEqualTo("edited");
        assertThat(summary().lastActivityAt()).isEqualTo(CREATED_AT);
        assertThat(summary().updatedAt()).isEqualTo(MUTATED_AT);
        assertThat(auditCount()).isEqualTo(2);
        assertThat(auditEvents().get(1).eventType())
                .isEqualTo(ChatMessageAuditEventType.MESSAGE_UPDATED);
        assertThat(auditEvents().get(1).before().content())
                .isEqualTo("original");
        assertThat(auditEvents().get(1).after().content())
                .isEqualTo("edited");

        ChatMessageMutationResult replay = mutationStore.edit(
                new EditChatMessageMutation(
                        "user-1",
                        editId,
                        "room-1",
                        created.messageId(),
                        "edited"));

        assertThat(replay.replayed()).isTrue();
        assertThat(replay.messageVersion()).isEqualTo(2);
        assertThat(outboxCount()).isEqualTo(1);
        assertThat(receiptCount()).isEqualTo(1);
        assertThat(auditCount()).isEqualTo(2);
        assertThat(summary().lastMessage().messageVersion()).isEqualTo(2);

        ChatMessageMutationResult conflict = mutationStore.edit(
                new EditChatMessageMutation(
                        "user-1",
                        editId,
                        "room-1",
                        created.messageId(),
                        "different"));
        assertThat(conflict.outcome())
                .isEqualTo(MessageMutationOutcome.IDEMPOTENCY_CONFLICT);
        assertThat(message().messageVersion()).isEqualTo(2);

        clearOutbox();
        ChatMessageMutationResult deleted = mutationStore.delete(
                new DeleteChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        created.messageId()));

        assertThat(deleted.outcome())
                .isEqualTo(MessageMutationOutcome.DELETED);
        assertThat(deleted.messageVersion()).isEqualTo(3);
        assertThat(message().state())
                .isEqualTo(MessageState.DELETED_BY_AUTHOR);
        assertThat(message().content()).isNull();
        assertThat(message().retainedContent()).isEqualTo("edited");
        assertThat(message().updatedAt()).isEqualTo(MUTATED_AT);
        assertThat(message().deletedAt()).isEqualTo(MUTATED_AT);
        assertThat(message().roomSequence()).isEqualTo(1);
        assertThat(outboxId())
                .isEqualTo("chat-message-deleted:message-1:v3");
        assertThat(summary().lastMessage().messageVersion()).isEqualTo(3);
        assertThat(summary().lastMessage().state())
                .isEqualTo(MessageState.DELETED_BY_AUTHOR);
        assertThat(summary().lastMessage().preview()).isNull();
        assertThat(summary().lastMessage().previewTruncated()).isFalse();
        assertThat(summary().lastMessage().createdAt())
                .isEqualTo(CREATED_AT);
        assertThat(summary().lastActivityAt()).isEqualTo(CREATED_AT);
        assertThat(summary().updatedAt()).isEqualTo(MUTATED_AT);
        assertThat(auditCount()).isEqualTo(3);
        assertThat(auditEvents().get(2).eventType())
                .isEqualTo(ChatMessageAuditEventType.MESSAGE_DELETED);
        assertThat(auditEvents().get(2).before().content())
                .isEqualTo("edited");
        assertThat(auditEvents().get(2).after().content()).isNull();

        assertThat(messageStore.append(new NewChatMessage(
                "room-1",
                "user-1",
                "membership-1",
                "message-client-1",
                "original")))
                .isInstanceOf(DuplicateChatMessage.class);
        assertThat(messageStore.append(new NewChatMessage(
                "room-1",
                "user-1",
                "membership-1",
                "message-client-1",
                "different original")))
                .isInstanceOf(ConflictingChatMessage.class);
        assertThat(message().messageVersion()).isEqualTo(3);

        MongoChatMessageStore nextMessageStore = CONFIGURATION.store(
                Clock.fixed(
                        MUTATED_AT.plusSeconds(1),
                        ZoneOffset.UTC),
                () -> "message-2",
                new SimpleMeterRegistry());
        StoredChatMessage next = (StoredChatMessage)
                nextMessageStore.append(new NewChatMessage(
                        "room-1",
                        "user-1",
                        "membership-1",
                        "message-client-2",
                        "next"));
        assertThat(next.message().roomSequence()).isEqualTo(2);
        assertThat(auditCount()).isEqualTo(4);
    }

    @Test
    void noOpsAndAuthorizationResultsDoNotWriteOutbox() {
        ChatMessage created = create("message-client-1");
        clearOutbox();

        ChatMessageMutationResult unchanged = mutationStore.edit(
                new EditChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        created.messageId(),
                        created.content()));
        assertThat(unchanged.outcome())
                .isEqualTo(MessageMutationOutcome.UNCHANGED);
        assertThat(unchanged.messageVersion()).isEqualTo(1);
        assertThat(outboxCount()).isZero();
        assertThat(auditCount()).isEqualTo(1);

        ChatMessageMutationResult forbidden = mutationStore.edit(
                new EditChatMessageMutation(
                        "user-2",
                        UUID.randomUUID().toString(),
                        "room-1",
                        created.messageId(),
                        "forbidden"));
        assertThat(forbidden.outcome())
                .isEqualTo(
                        MessageMutationOutcome
                                .MESSAGE_MUTATION_FORBIDDEN);
        assertThat(outboxCount()).isZero();

        ChatMessageMutationResult missing = mutationStore.delete(
                new DeleteChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "other-room",
                        created.messageId()));
        assertThat(missing.outcome())
                .isEqualTo(MessageMutationOutcome.MESSAGE_NOT_FOUND);
        assertThat(outboxCount()).isZero();
    }

    @Test
    void auditFailureRollsBackUpdateDeleteAndAuditSequence() {
        create("message-client-1");
        clearOutbox();
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        MongoChatMessageAuditStore auditStore =
                new MongoChatMessageAuditStore(
                        CONFIGURATION.mongoOperations(),
                        registry);
        ChatMessageMutationStore failingStore =
                CONFIGURATION.mutationStore(
                        Clock.fixed(MUTATED_AT, ZoneOffset.UTC),
                        new MongoChatMessageOutboxStore(
                                CONFIGURATION.mongoOperations()),
                        new FailingAfterAppendChatMessageAuditWriter(
                                auditStore),
                        CONFIGURATION.summaryWriter(),
                        registry);

        assertThatThrownBy(() -> failingStore.edit(
                new EditChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        "message-1",
                        "edited")))
                .isInstanceOf(ChatMessageStoreException.class);
        assertAuditFailureRollback();

        assertThatThrownBy(() -> failingStore.delete(
                new DeleteChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        "message-1")))
                .isInstanceOf(ChatMessageStoreException.class);
        assertAuditFailureRollback();
    }

    @Test
    void concurrentDifferentMessageUpdatesAllocateUniqueRoomChanges()
            throws Exception {
        ChatMessage first = create("message-client-1");
        MongoChatMessageStore secondStore = CONFIGURATION.store(
                Clock.fixed(CREATED_AT, ZoneOffset.UTC),
                () -> "message-2",
                new SimpleMeterRegistry());
        ChatMessage second = ((StoredChatMessage) secondStore.append(
                new NewChatMessage(
                        "room-1",
                        "user-1",
                        "membership-1",
                        "message-client-2",
                        "second original"))).message();
        clearOutbox();

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<ChatMessageMutationResult> firstResult =
                    executor.submit(() -> {
                        ready.countDown();
                        start.await();
                        return mutationStore.edit(
                                new EditChatMessageMutation(
                                        "user-1",
                                        UUID.randomUUID().toString(),
                                        "room-1",
                                        first.messageId(),
                                        "first edited"));
                    });
            Future<ChatMessageMutationResult> secondResult =
                    executor.submit(() -> {
                        ready.countDown();
                        start.await();
                        return mutationStore.edit(
                                new EditChatMessageMutation(
                                        "user-1",
                                        UUID.randomUUID().toString(),
                                        "room-1",
                                        second.messageId(),
                                        "second edited"));
                    });
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            assertThat(firstResult.get(20, TimeUnit.SECONDS).outcome())
                    .isEqualTo(MessageMutationOutcome.UPDATED);
            assertThat(secondResult.get(20, TimeUnit.SECONDS).outcome())
                    .isEqualTo(MessageMutationOutcome.UPDATED);
        } finally {
            executor.shutdownNow();
        }

        assertThat(auditEvents())
                .extracting(event -> event.roomChangeSequence())
                .containsExactly(1L, 2L, 3L, 4L);
        assertThat(auditEvents().subList(2, 4))
                .extracting(event -> event.messageId())
                .containsExactlyInAnyOrder("message-1", "message-2");
    }

    @Test
    void deleteAgainAndEditDeletedAreStableNoOps() {
        ChatMessage created = create("message-client-1");
        clearOutbox();
        mutationStore.delete(new DeleteChatMessageMutation(
                "user-1",
                UUID.randomUUID().toString(),
                "room-1",
                created.messageId()));
        clearOutbox();

        ChatMessageMutationResult alreadyDeleted =
                mutationStore.delete(new DeleteChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        created.messageId()));
        ChatMessageMutationResult editDeleted =
                mutationStore.edit(new EditChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        created.messageId(),
                        "cannot edit"));

        assertThat(alreadyDeleted.outcome())
                .isEqualTo(MessageMutationOutcome.ALREADY_DELETED);
        assertThat(editDeleted.outcome())
                .isEqualTo(MessageMutationOutcome.MESSAGE_DELETED);
        assertThat(alreadyDeleted.messageVersion()).isEqualTo(2);
        assertThat(editDeleted.messageVersion()).isEqualTo(2);
        assertThat(outboxCount()).isZero();
        assertThat(auditCount()).isEqualTo(2);
        assertThat(message().retainedContent()).isEqualTo("original");
    }

    @Test
    void rejectsLegacySchemaWithoutCountable() {
        assertThatThrownBy(() -> new MongoChatMessageDocument(
                "legacy-1",
                1,
                "room-1",
                7,
                "user-1",
                "membership-1",
                "legacy-client",
                "legacy",
                CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported or malformed");
    }

    @Test
    void outboxFailureRollsBackMessageAndReceipt() {
        ChatMessage created = create("message-client-1");
        clearOutbox();
        ChatMessageMutationStore failingStore =
                CONFIGURATION.mutationStore(
                        Clock.fixed(MUTATED_AT, ZoneOffset.UTC),
                        new ChatMessageOutboxWriter() {
                            @Override
                            public void appendMessageCreated(
                                    ChatMessage message
                            ) {
                            }

                            @Override
                            public void appendMessageUpdated(
                                    ChatMessage message
                            ) {
                                throw new IllegalStateException(
                                        "forced outbox failure");
                            }
                        },
                        new SimpleMeterRegistry());

        assertThatThrownBy(() -> failingStore.edit(
                new EditChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        created.messageId(),
                        "will roll back")))
                .isInstanceOf(ChatMessageStoreException.class);

        assertThat(message().content()).isEqualTo("original");
        assertThat(message().messageVersion()).isEqualTo(1);
        assertThat(receiptCount()).isZero();
        assertThat(outboxCount()).isZero();
        assertThat(summary().lastMessage().messageVersion()).isEqualTo(1);
        assertThat(summary().lastMessage().preview()).isEqualTo("original");
        assertAuditStateUnchanged(1, 1);
    }

    @Test
    void deleteOutboxFailureRollsBackMessageReceiptAndAudit() {
        ChatMessage created = create("message-client-1");
        clearOutbox();
        ChatMessageMutationStore failingStore =
                CONFIGURATION.mutationStore(
                        Clock.fixed(MUTATED_AT, ZoneOffset.UTC),
                        new ChatMessageOutboxWriter() {
                            @Override
                            public void appendMessageCreated(
                                    ChatMessage message
                            ) {
                            }

                            @Override
                            public void appendMessageDeleted(
                                    ChatMessage message
                            ) {
                                throw new IllegalStateException(
                                        "forced delete outbox failure");
                            }
                        },
                        new SimpleMeterRegistry());

        assertThatThrownBy(() -> failingStore.delete(
                new DeleteChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        created.messageId())))
                .isInstanceOf(ChatMessageStoreException.class);

        assertAuditFailureRollback();
    }

    @Test
    void summaryFailureRollsBackUpdateDeleteReceiptAndOutbox() {
        ChatMessage created = create("message-client-1");
        clearOutbox();
        ChatMessageMutationStore failingStore =
                CONFIGURATION.mutationStore(
                        Clock.fixed(MUTATED_AT, ZoneOffset.UTC),
                        new MongoChatMessageOutboxStore(
                                CONFIGURATION.mongoOperations()),
                        new FailingRoomInboxSummaryWriter(),
                        new SimpleMeterRegistry());

        assertThatThrownBy(() -> failingStore.edit(
                new EditChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        created.messageId(),
                        "will roll back")))
                .isInstanceOf(RuntimeException.class)
                .hasRootCauseMessage("forced summary update failure");
        assertUnchangedAfterSummaryFailure();

        assertThatThrownBy(() -> failingStore.delete(
                new DeleteChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        created.messageId())))
                .isInstanceOf(RuntimeException.class)
                .hasRootCauseMessage("forced summary delete failure");
        assertUnchangedAfterSummaryFailure();
    }

    @Test
    void receiptInsertFailureRollsBackMessageAndOutbox() {
        ChatMessage created = create("message-client-1");
        clearOutbox();
        String mutationId = UUID.randomUUID().toString();
        insertConflictingReceipt(
                mutationId,
                MessageMutationCommandType.EDIT_MESSAGE);

        assertThatThrownBy(() -> mutationStore.edit(
                new EditChatMessageMutation(
                        "user-1",
                        mutationId,
                        "room-1",
                        created.messageId(),
                        "will roll back")))
                .isInstanceOf(ChatMessageStoreException.class);

        assertThat(message().content()).isEqualTo("original");
        assertThat(message().messageVersion()).isEqualTo(1);
        assertThat(receiptCount()).isEqualTo(1);
        assertThat(outboxCount()).isZero();
        assertThat(summary().lastMessage().messageVersion()).isEqualTo(1);
        assertThat(summary().lastMessage().preview()).isEqualTo("original");
        assertThat(summary().lastMessage().state())
                .isEqualTo(MessageState.ACTIVE);
        assertThat(summary().updatedAt()).isEqualTo(CREATED_AT);
        assertAuditStateUnchanged(1, 1);
    }

    @Test
    void deleteReceiptInsertFailureRollsBackMessageAndAudit() {
        ChatMessage created = create("message-client-1");
        clearOutbox();
        String mutationId = UUID.randomUUID().toString();
        insertConflictingReceipt(
                mutationId,
                MessageMutationCommandType.DELETE_MESSAGE);

        assertThatThrownBy(() -> mutationStore.delete(
                new DeleteChatMessageMutation(
                        "user-1",
                        mutationId,
                        "room-1",
                        created.messageId())))
                .isInstanceOf(ChatMessageStoreException.class);

        assertThat(message().content()).isEqualTo("original");
        assertThat(message().retainedContent()).isNull();
        assertThat(message().state()).isEqualTo(MessageState.ACTIVE);
        assertThat(message().messageVersion()).isEqualTo(1);
        assertThat(receiptCount()).isEqualTo(1);
        assertThat(outboxCount()).isZero();
        assertThat(summary().lastMessage().messageVersion()).isEqualTo(1);
        assertThat(summary().lastMessage().preview()).isEqualTo("original");
        assertAuditStateUnchanged(1, 1);
    }

    @Test
    void committedMutationWithUnknownResponseRecoversReceiptOnce() {
        ChatMessage created = create("message-client-1");
        clearOutbox();
        AtomicBoolean firstExecution = new AtomicBoolean(true);
        TransactionOperations delegate =
                CONFIGURATION.transactionOperations();
        TransactionOperations unknownAfterCommit =
                new TransactionOperations() {
                    @Override
                    public <T> T execute(
                            TransactionCallback<T> action
                    ) {
                        T result = delegate.execute(action);
                        if (firstExecution.compareAndSet(true, false)) {
                            MongoException unknown =
                                    new MongoException(
                                            "commit response lost");
                            unknown.addLabel(
                                    MongoException
                                            .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
                            throw unknown;
                        }
                        return result;
                    }

                    @Override
                    public void executeWithoutResult(
                            java.util.function.Consumer
                                    <TransactionStatus> action
                    ) {
                        delegate.executeWithoutResult(action);
                    }
                };
        ChatMessageMutationStore recoveringStore =
                new MongoChatMessageMutationStore(
                        CONFIGURATION.mongoOperations(),
                        unknownAfterCommit,
                        Clock.fixed(MUTATED_AT, ZoneOffset.UTC),
                        new MongoChatMessageExceptionClassifier(),
                        CONFIGURATION.auditWriter(
                                new SimpleMeterRegistry()),
                        new MongoChatMessageOutboxStore(
                                CONFIGURATION.mongoOperations()),
                        CONFIGURATION.summaryWriter(),
                        new SimpleMeterRegistry());

        ChatMessageMutationResult result = recoveringStore.edit(
                new EditChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        created.messageId(),
                        "edited once"));

        assertThat(result.outcome())
                .isEqualTo(MessageMutationOutcome.UPDATED);
        assertThat(result.replayed()).isTrue();
        assertThat(result.messageVersion()).isEqualTo(2);
        assertThat(message().content()).isEqualTo("edited once");
        assertThat(message().messageVersion()).isEqualTo(2);
        assertThat(receiptCount()).isEqualTo(1);
        assertThat(outboxCount()).isEqualTo(1);
        assertThat(outboxId())
                .isEqualTo("chat-message-updated:message-1:v2");
        assertThat(summary().lastMessage().messageVersion()).isEqualTo(2);
        assertThat(summary().lastMessage().preview())
                .isEqualTo("edited once");
        assertThat(summary().lastMessage().state())
                .isEqualTo(MessageState.ACTIVE);
        assertThat(summary().lastActivityAt()).isEqualTo(CREATED_AT);
        assertThat(summary().updatedAt()).isEqualTo(MUTATED_AT);
    }

    private ChatMessage create(String clientMessageId) {
        return ((StoredChatMessage) messageStore.append(
                new NewChatMessage(
                        "room-1",
                        "user-1",
                        "membership-1",
                        clientMessageId,
                        "original"))).message();
    }

    private MongoChatMessageDocument message() {
        return message("message-1");
    }

    private MongoChatMessageDocument message(String messageId) {
        return CONFIGURATION.mongoOperations().findById(
                messageId,
                MongoChatMessageDocument.class);
    }

    private RoomInboxSummary summary() {
        return CONFIGURATION.mongoOperations().findById(
                        "room-1",
                        MongoRoomInboxSummaryDocument.class,
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .toDomain();
    }

    private void assertUnchangedAfterSummaryFailure() {
        assertThat(message().content()).isEqualTo("original");
        assertThat(message().state()).isEqualTo(MessageState.ACTIVE);
        assertThat(message().messageVersion()).isEqualTo(1);
        assertThat(receiptCount()).isZero();
        assertThat(outboxCount()).isZero();
        assertThat(summary().lastMessage().messageVersion()).isEqualTo(1);
        assertThat(summary().lastMessage().preview()).isEqualTo("original");
        assertAuditStateUnchanged(1, 1);
    }

    private long receiptCount() {
        return CONFIGURATION.mongoOperations().count(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoChatMessageMutationReceiptDocument.COLLECTION_NAME);
    }

    private void insertConflictingReceipt(
            String mutationId,
            MessageMutationCommandType commandType
    ) {
        CONFIGURATION.mongoOperations().insert(
                new MongoChatMessageMutationReceiptDocument(
                        "user-1:" + mutationId,
                        1,
                        "different-user",
                        UUID.randomUUID().toString(),
                        commandType,
                        "room-1",
                        "other-message",
                        "corrupt-collision",
                        MessageMutationOutcome.MESSAGE_NOT_FOUND,
                        null,
                        null,
                        null,
                        MUTATED_AT));
    }

    private long outboxCount() {
        return CONFIGURATION.mongoOperations().count(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoChatMessageOutboxDocument.COLLECTION_NAME);
    }

    private long auditCount() {
        return CONFIGURATION.mongoOperations().count(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoChatMessageAuditEventDocument.COLLECTION_NAME);
    }

    private void assertAuditStateUnchanged(
            long expectedCount,
            long expectedSequence
    ) {
        MongoRoomMessageAuditSequenceDocument sequence =
                CONFIGURATION.mongoOperations().findById(
                        "room-1",
                        MongoRoomMessageAuditSequenceDocument.class);

        assertThat(auditCount()).isEqualTo(expectedCount);
        assertThat(sequence == null ? 0 : sequence.lastSequence())
                .isEqualTo(expectedSequence);
    }

    private java.util.List<com.hamcheeze.chat.message.audit.ChatMessageAuditEvent>
    auditEvents() {
        return new MongoChatMessageAuditStore(
                CONFIGURATION.mongoOperations(),
                new SimpleMeterRegistry())
                .findChanges("room-1", 0, Long.MAX_VALUE, 100);
    }

    private void assertAuditFailureRollback() {
        assertThat(message().content()).isEqualTo("original");
        assertThat(message().retainedContent()).isNull();
        assertThat(message().state()).isEqualTo(MessageState.ACTIVE);
        assertThat(message().messageVersion()).isEqualTo(1);
        assertThat(auditCount()).isEqualTo(1);
        MongoRoomMessageAuditSequenceDocument sequence =
                CONFIGURATION.mongoOperations().findById(
                        "room-1",
                        MongoRoomMessageAuditSequenceDocument.class);
        assertThat(sequence).isNotNull();
        assertThat(sequence.lastSequence()).isEqualTo(1);
        assertThat(receiptCount()).isZero();
        assertThat(outboxCount()).isZero();
        assertThat(summary().lastMessage().messageVersion()).isEqualTo(1);
    }

    private String outboxId() {
        Document document = CONFIGURATION.mongoOperations()
                .getCollection(
                        MongoChatMessageOutboxDocument.COLLECTION_NAME)
                .find()
                .first();
        assertThat(document).isNotNull();
        return document.getString("_id");
    }

    private void clearOutbox() {
        CONFIGURATION.mongoOperations().remove(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoChatMessageOutboxDocument.COLLECTION_NAME);
    }

    private static final class FailingRoomInboxSummaryWriter
            implements RoomInboxSummaryWriter {

        @Override
        public SummaryWriteResult applyCreated(ChatMessage message) {
            throw new UnsupportedOperationException();
        }

        @Override
        public SummaryWriteResult applyUpdated(ChatMessage message) {
            throw new IllegalStateException(
                    "forced summary update failure");
        }

        @Override
        public SummaryWriteResult applyDeleted(ChatMessage message) {
            throw new IllegalStateException(
                    "forced summary delete failure");
        }
    }
}
