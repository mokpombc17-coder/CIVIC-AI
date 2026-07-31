package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageMutationResult;
import com.hamcheeze.chat.message.EditChatMessageMutation;
import com.hamcheeze.chat.message.MessageMutationCommandType;
import com.hamcheeze.chat.message.MessageMutationOutcome;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxWriter;
import com.mongodb.MongoException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class MongoChatMessageMutationStoreRetryTest {

    @Test
    void unknownCommitResolvesReceiptWithoutApplyingAgain() {
        MongoOperations mongoOperations =
                mock(MongoOperations.class);
        TransactionOperations transactionOperations =
                mock(TransactionOperations.class);
        ChatMessageOutboxWriter outboxWriter =
                mock(ChatMessageOutboxWriter.class);
        String mutationId =
                "550e8400-e29b-41d4-a716-446655440010";
        Instant processedAt =
                Instant.parse("2026-07-31T02:00:00Z");
        MongoChatMessageMutationReceiptDocument receipt =
                new MongoChatMessageMutationReceiptDocument(
                        "user-1:" + mutationId,
                        1,
                        "user-1",
                        mutationId,
                        MessageMutationCommandType.EDIT_MESSAGE,
                        "room-1",
                        "message-1",
                        fingerprintForEdit(),
                        MessageMutationOutcome.UPDATED,
                        10L,
                        2L,
                        MessageState.ACTIVE,
                        processedAt);
        MongoException unknown = new MongoException("unknown");
        unknown.addLabel(
                MongoException
                        .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknown);
        when(mongoOperations.findOne(
                any(),
                eq(MongoChatMessageMutationReceiptDocument.class),
                eq(MongoChatMessageMutationReceiptDocument
                        .COLLECTION_NAME)))
                .thenReturn(receipt);
        MongoChatMessageMutationStore store =
                new MongoChatMessageMutationStore(
                        mongoOperations,
                        transactionOperations,
                        Clock.fixed(processedAt, ZoneOffset.UTC),
                        new MongoChatMessageExceptionClassifier(),
                        outboxWriter,
                        new SimpleMeterRegistry());

        ChatMessageMutationResult result = store.edit(
                new EditChatMessageMutation(
                        "user-1",
                        mutationId,
                        "room-1",
                        "message-1",
                        "edited"));

        assertThat(result.outcome())
                .isEqualTo(MessageMutationOutcome.UPDATED);
        assertThat(result.replayed()).isTrue();
        assertThat(result.messageVersion()).isEqualTo(2);
        verifyNoInteractions(outboxWriter);
    }

    private static String fingerprintForEdit() {
        // SHA-256 of the store's length-prefixed canonical tuple:
        // EDIT_MESSAGE, room-1, message-1, edited.
        return "bb32ad81159aaada48cb9497c3b6f137da23a266d7ef5982e0d6198e33f8a14a";
    }
}
