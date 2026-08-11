package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageMutationResult;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import com.hamcheeze.chat.message.EditChatMessageMutation;
import com.hamcheeze.chat.message.MessageMutationCommandType;
import com.hamcheeze.chat.message.MessageMutationOutcome;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxWriter;
import com.hamcheeze.chat.message.audit.ChatMessageAuditWriter;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummaryWriter;
import com.mongodb.MongoException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class MongoChatMessageMutationStoreRetryTest {

    private static final String MUTATION_ID =
            "550e8400-e29b-41d4-a716-446655440010";
    private static final Instant PROCESSED_AT =
            Instant.parse("2026-07-31T02:00:00Z");

    @Test
    void transientFailureRetriesAndReturnsBusinessResult() {
        RetryFixture fixture = fixture();
        ChatMessageMutationResult success = updatedResult(false);
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(transientFailure("transient"))
                .thenReturn(success);

        ChatMessageMutationResult result = edit(fixture.store());

        assertThat(result).isEqualTo(success);
        verify(fixture.transactionOperations(), times(2))
                .execute(any());
    }

    @Test
    void transientRetryExhaustionRemainsTransient() {
        RetryFixture fixture = fixture();
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(transientFailure("transient"));

        ChatMessageStoreException failure = failureFrom(
                fixture.store());

        assertThat(failure.kind())
                .isEqualTo(ChatMessageStoreFailureKind.TRANSIENT);
        assertThat(failure.retryable()).isTrue();
        verify(fixture.transactionOperations(), times(3))
                .execute(any());
    }

    @Test
    void unknownCommitResolvesReceiptWithoutApplyingAgain() {
        RetryFixture fixture = fixture();
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(unknownCommit("unknown"));
        whenReceiptLookup(fixture.mongoOperations())
                .thenReturn(receipt());

        ChatMessageMutationResult result = edit(fixture.store());

        assertUpdatedReplay(result);
        verifyNoInteractions(fixture.outboxWriter());
    }

    @Test
    void unknownCommitReceiptLookupTransientFailureThenRecovers() {
        RetryFixture fixture = fixture();
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(unknownCommit("unknown"))
                .thenThrow(new DuplicateKeyException("duplicate"));
        whenReceiptLookup(fixture.mongoOperations())
                .thenThrow(transientFailure("lookup transient"))
                .thenReturn(receipt());

        ChatMessageMutationResult result = edit(fixture.store());

        assertUpdatedReplay(result);
        verify(fixture.transactionOperations(), times(2))
                .execute(any());
        verifyNoInteractions(fixture.outboxWriter());
    }

    @Test
    void unknownCommitMissingReceiptThenLaterReceiptRecovers() {
        RetryFixture fixture = fixture();
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(unknownCommit("unknown"))
                .thenThrow(new DuplicateKeyException("duplicate"));
        whenReceiptLookup(fixture.mongoOperations())
                .thenReturn(null, receipt());

        ChatMessageMutationResult result = edit(fixture.store());

        assertUpdatedReplay(result);
        verify(fixture.transactionOperations(), times(2))
                .execute(any());
        verifyNoInteractions(fixture.outboxWriter());
    }

    @Test
    void unknownCommitFollowedByPermanentFailureStaysUnknown() {
        RetryFixture fixture = fixture();
        MongoException unknown = unknownCommit("unknown");
        MongoException permanent = permanentFailure("permanent");
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(unknown)
                .thenThrow(permanent);
        whenReceiptLookup(fixture.mongoOperations())
                .thenReturn(null);

        ChatMessageStoreException failure = failureFrom(
                fixture.store());

        assertThat(failure.kind())
                .isEqualTo(ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
        assertThat(failure.retryable()).isTrue();
        assertThat(failure.getCause()).isSameAs(unknown);
        assertThat(failure.getSuppressed()).contains(permanent);
    }

    @Test
    void unknownCommitFollowedByTransientFailuresStaysUnknown() {
        RetryFixture fixture = fixture();
        MongoException unknown = unknownCommit("unknown");
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(unknown)
                .thenThrow(transientFailure("transient"));
        whenReceiptLookup(fixture.mongoOperations())
                .thenReturn(null);

        ChatMessageStoreException failure = failureFrom(
                fixture.store());

        assertThat(failure.kind())
                .isEqualTo(ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
        assertThat(failure.retryable()).isTrue();
        assertThat(failure.getCause()).isSameAs(unknown);
        verify(fixture.transactionOperations(), times(3))
                .execute(any());
    }

    @Test
    void unknownCommitRetryExhaustionStaysUnknown() {
        RetryFixture fixture = fixture();
        MongoException unknown = unknownCommit("unknown");
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(unknown);
        whenReceiptLookup(fixture.mongoOperations())
                .thenReturn(null);

        ChatMessageStoreException failure = failureFrom(
                fixture.store());

        assertThat(failure.kind())
                .isEqualTo(ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
        assertThat(failure.retryable()).isTrue();
        assertThat(failure.getCause()).isSameAs(unknown);
        verify(fixture.transactionOperations(), times(3))
                .execute(any());
    }

    @Test
    void duplicateReceiptMissThenLaterReceiptRecovers() {
        RetryFixture fixture = fixture();
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(new DuplicateKeyException("duplicate"));
        whenReceiptLookup(fixture.mongoOperations())
                .thenReturn(null, receipt());

        ChatMessageMutationResult result = edit(fixture.store());

        assertUpdatedReplay(result);
        verify(fixture.transactionOperations(), times(2))
                .execute(any());
        verifyNoInteractions(fixture.outboxWriter());
    }

    @Test
    void duplicateReceiptLookupTransientFailureThenRecovers() {
        RetryFixture fixture = fixture();
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(new DuplicateKeyException("duplicate"));
        whenReceiptLookup(fixture.mongoOperations())
                .thenThrow(transientFailure("lookup transient"))
                .thenReturn(receipt());

        ChatMessageMutationResult result = edit(fixture.store());

        assertUpdatedReplay(result);
        verify(fixture.transactionOperations(), times(2))
                .execute(any());
        verifyNoInteractions(fixture.outboxWriter());
    }

    @Test
    void duplicateReceiptRaceExhaustionIsTransient() {
        RetryFixture fixture = fixture();
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(new DuplicateKeyException("duplicate"));
        whenReceiptLookup(fixture.mongoOperations())
                .thenReturn(null);

        ChatMessageStoreException failure = failureFrom(
                fixture.store());

        assertThat(failure.kind())
                .isEqualTo(ChatMessageStoreFailureKind.TRANSIENT);
        assertThat(failure.retryable()).isTrue();
        verify(fixture.transactionOperations(), times(3))
                .execute(any());
    }

    @Test
    void duplicateReceiptRaceAfterUnknownCommitStaysUnknown() {
        RetryFixture fixture = fixture();
        MongoException unknown = unknownCommit("unknown");
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(unknown)
                .thenThrow(new DuplicateKeyException("duplicate"));
        whenReceiptLookup(fixture.mongoOperations())
                .thenReturn(null);

        ChatMessageStoreException failure = failureFrom(
                fixture.store());

        assertThat(failure.kind())
                .isEqualTo(ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
        assertThat(failure.retryable()).isTrue();
        assertThat(failure.getCause()).isSameAs(unknown);
        verify(fixture.transactionOperations(), times(3))
                .execute(any());
    }

    @Test
    void unknownCommitBackoffInterruptionStaysUnknown() {
        RetryFixture fixture = fixture();
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(unknownCommit("unknown"));
        whenReceiptLookup(fixture.mongoOperations())
                .thenReturn(null);

        Thread.currentThread().interrupt();
        try {
            ChatMessageStoreException failure = failureFrom(
                    fixture.store());

            assertThat(failure.kind())
                    .isEqualTo(
                            ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
            assertThat(failure.retryable()).isTrue();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();
        }
    }

    @Test
    void transientBackoffInterruptionRemainsTransient() {
        RetryFixture fixture = fixture();
        when(fixture.transactionOperations().execute(any()))
                .thenThrow(transientFailure("transient"));

        Thread.currentThread().interrupt();
        try {
            ChatMessageStoreException failure = failureFrom(
                    fixture.store());

            assertThat(failure.kind())
                    .isEqualTo(ChatMessageStoreFailureKind.TRANSIENT);
            assertThat(failure.retryable()).isTrue();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();
        }
    }

    private static RetryFixture fixture() {
        MongoOperations mongoOperations =
                mock(MongoOperations.class);
        TransactionOperations transactionOperations =
                mock(TransactionOperations.class);
        ChatMessageOutboxWriter outboxWriter =
                mock(ChatMessageOutboxWriter.class);
        MongoChatMessageMutationStore store =
                new MongoChatMessageMutationStore(
                        mongoOperations,
                        transactionOperations,
                        Clock.fixed(PROCESSED_AT, ZoneOffset.UTC),
                        new MongoChatMessageExceptionClassifier(),
                        mock(ChatMessageAuditWriter.class),
                        outboxWriter,
                        mock(RoomInboxSummaryWriter.class),
                        new SimpleMeterRegistry());
        return new RetryFixture(
                mongoOperations,
                transactionOperations,
                outboxWriter,
                store);
    }

    private static org.mockito.stubbing.OngoingStubbing
            <MongoChatMessageMutationReceiptDocument> whenReceiptLookup(
            MongoOperations mongoOperations
    ) {
        return when(mongoOperations.findOne(
                any(),
                eq(MongoChatMessageMutationReceiptDocument.class),
                eq(MongoChatMessageMutationReceiptDocument
                        .COLLECTION_NAME)));
    }

    private static ChatMessageMutationResult edit(
            MongoChatMessageMutationStore store
    ) {
        return store.edit(new EditChatMessageMutation(
                "user-1",
                MUTATION_ID,
                "room-1",
                "message-1",
                "edited"));
    }

    private static ChatMessageStoreException failureFrom(
            MongoChatMessageMutationStore store
    ) {
        return catchThrowableOfType(
                () -> edit(store),
                ChatMessageStoreException.class);
    }

    private static void assertUpdatedReplay(
            ChatMessageMutationResult result
    ) {
        assertThat(result.outcome())
                .isEqualTo(MessageMutationOutcome.UPDATED);
        assertThat(result.replayed()).isTrue();
        assertThat(result.messageVersion()).isEqualTo(2);
    }

    private static ChatMessageMutationResult updatedResult(
            boolean replayed
    ) {
        return new ChatMessageMutationResult(
                MessageMutationCommandType.EDIT_MESSAGE,
                MUTATION_ID,
                MessageMutationOutcome.UPDATED,
                "message-1",
                10L,
                2L,
                MessageState.ACTIVE,
                replayed);
    }

    private static MongoChatMessageMutationReceiptDocument receipt() {
        return new MongoChatMessageMutationReceiptDocument(
                "user-1:" + MUTATION_ID,
                1,
                "user-1",
                MUTATION_ID,
                MessageMutationCommandType.EDIT_MESSAGE,
                "room-1",
                "message-1",
                fingerprintForEdit(),
                MessageMutationOutcome.UPDATED,
                10L,
                2L,
                MessageState.ACTIVE,
                PROCESSED_AT);
    }

    private static MongoException unknownCommit(String message) {
        MongoException exception = new MongoException(message);
        exception.addLabel(
                MongoException
                        .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        return exception;
    }

    private static MongoException transientFailure(String message) {
        MongoException exception = new MongoException(message);
        exception.addLabel(
                MongoException.TRANSIENT_TRANSACTION_ERROR_LABEL);
        return exception;
    }

    private static MongoException permanentFailure(String message) {
        return new MongoException(message);
    }

    private static String fingerprintForEdit() {
        // SHA-256 of the store's length-prefixed canonical tuple:
        // EDIT_MESSAGE, room-1, message-1, edited.
        return "bb32ad81159aaada48cb9497c3b6f137da23a266d7ef5982e0d6198e33f8a14a";
    }

    private record RetryFixture(
            MongoOperations mongoOperations,
            TransactionOperations transactionOperations,
            ChatMessageOutboxWriter outboxWriter,
            MongoChatMessageMutationStore store
    ) {
    }
}
