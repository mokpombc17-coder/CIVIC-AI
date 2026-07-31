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
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxWriter;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxDocument;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxStore;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

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
        assertThat(message().roomSequence()).isEqualTo(1);
        assertThat(message().schemaVersion()).isEqualTo(2);
        assertThat(outboxCount()).isEqualTo(1);
        assertThat(outboxId())
                .isEqualTo("chat-message-updated:message-1:v2");

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
        assertThat(message().updatedAt()).isEqualTo(MUTATED_AT);
        assertThat(message().deletedAt()).isEqualTo(MUTATED_AT);
        assertThat(message().roomSequence()).isEqualTo(1);
        assertThat(outboxId())
                .isEqualTo("chat-message-deleted:message-1:v3");

        assertThat(messageStore.append(new NewChatMessage(
                "room-1",
                "user-1",
                "message-client-1",
                "original")))
                .isInstanceOf(DuplicateChatMessage.class);
        assertThat(messageStore.append(new NewChatMessage(
                "room-1",
                "user-1",
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
                        "message-client-2",
                        "next"));
        assertThat(next.message().roomSequence()).isEqualTo(2);
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
    }

    @Test
    void upgradesLegacySchemaOneMessageOnFirstEdit() {
        CONFIGURATION.mongoOperations().insert(
                new MongoChatMessageDocument(
                        "legacy-1",
                        1,
                        "room-1",
                        7,
                        "user-1",
                        "legacy-client",
                        "legacy",
                        CREATED_AT));
        CONFIGURATION.mongoOperations().insert(
                new MongoChatMessageDocument(
                        "legacy-2",
                        1,
                        "room-1",
                        8,
                        "user-1",
                        "legacy-client-2",
                        "legacy delete",
                        CREATED_AT));

        ChatMessageMutationResult result = mutationStore.edit(
                new EditChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        "legacy-1",
                        "edited legacy"));

        assertThat(result.outcome())
                .isEqualTo(MessageMutationOutcome.UPDATED);
        assertThat(result.messageVersion()).isEqualTo(2);
        assertThat(message("legacy-1").schemaVersion()).isEqualTo(2);
        assertThat(message("legacy-1").updatedAt())
                .isEqualTo(MUTATED_AT);

        ChatMessageMutationResult deleted = mutationStore.delete(
                new DeleteChatMessageMutation(
                        "user-1",
                        UUID.randomUUID().toString(),
                        "room-1",
                        "legacy-2"));
        assertThat(deleted.outcome())
                .isEqualTo(MessageMutationOutcome.DELETED);
        assertThat(message("legacy-2").schemaVersion()).isEqualTo(2);
        assertThat(message("legacy-2").content()).isNull();
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
    }

    @Test
    void receiptInsertFailureRollsBackMessageAndOutbox() {
        ChatMessage created = create("message-client-1");
        clearOutbox();
        String mutationId = UUID.randomUUID().toString();
        CONFIGURATION.mongoOperations().insert(
                new MongoChatMessageMutationReceiptDocument(
                        "user-1:" + mutationId,
                        1,
                        "different-user",
                        UUID.randomUUID().toString(),
                        com.hamcheeze.chat.message
                                .MessageMutationCommandType
                                .EDIT_MESSAGE,
                        "room-1",
                        "other-message",
                        "corrupt-collision",
                        MessageMutationOutcome.MESSAGE_NOT_FOUND,
                        null,
                        null,
                        null,
                        MUTATED_AT));

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
    }

    private ChatMessage create(String clientMessageId) {
        return ((StoredChatMessage) messageStore.append(
                new NewChatMessage(
                        "room-1",
                        "user-1",
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

    private long receiptCount() {
        return CONFIGURATION.mongoOperations().count(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoChatMessageMutationReceiptDocument.COLLECTION_NAME);
    }

    private long outboxCount() {
        return CONFIGURATION.mongoOperations().count(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoChatMessageOutboxDocument.COLLECTION_NAME);
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
}
