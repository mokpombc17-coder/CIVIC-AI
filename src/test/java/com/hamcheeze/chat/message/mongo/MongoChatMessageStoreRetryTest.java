package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import com.hamcheeze.chat.message.ConflictingChatMessage;
import com.hamcheeze.chat.message.DuplicateChatMessage;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoreChatMessageResult;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.metrics.ThrowingMeterRegistry;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummaryWriter;
import com.mongodb.MongoException;
import com.mongodb.MongoTimeoutException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import org.mockito.stubbing.Answer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MongoChatMessageStoreRetryTest {

    private static final Instant NOW =
            Instant.parse("2026-07-27T05:00:00Z");
    private static final String RETRY_METRIC =
            "chat.message.store.transaction.retries";

    private MongoOperations mongoOperations;
    private TransactionOperations transactionOperations;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        mongoOperations = mock(MongoOperations.class);
        transactionOperations =
                mock(TransactionOperations.class);
        meterRegistry = new SimpleMeterRegistry();
    }

    @Test
    void transientTransactionIsRetriedAndKeepsCandidateIdentity() {
        MongoException transientFailure =
                labelled(
                        MongoException
                                .TRANSIENT_TRANSACTION_ERROR_LABEL);
        StoredChatMessage stored = stored("candidate-id");
        when(transactionOperations.execute(any()))
                .thenThrow(transientFailure)
                .thenReturn(stored);
        AtomicInteger generatedIds = new AtomicInteger();

        assertThat(store(
                meterRegistry,
                () -> {
                    generatedIds.incrementAndGet();
                    return "candidate-id";
                }).append(message()))
                .isEqualTo(stored);

        verify(transactionOperations, times(2)).execute(any());
        assertThat(generatedIds).hasValue(1);
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "transient_transaction").count()).isEqualTo(1);
    }

    @Test
    void unknownCommitRecoversStoredCandidateWithoutRetry() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit);
        when(mongoOperations.findOne(
                any(),
                eq(MongoChatMessageDocument.class)))
                .thenReturn(document("candidate-id"));

        assertThat(store(meterRegistry).append(message()))
                .isEqualTo(stored("candidate-id"));
        verify(transactionOperations, times(1)).execute(any());
    }

    @Test
    void unknownRecoveryUsesCandidateDocumentWhenItMatchesRequest() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit);
        MongoChatMessageDocument candidateDocument =
                document("candidate-id");
        stubIdempotencyMissThenCandidateDocument(
                candidateDocument);
        AtomicInteger generatedIds = new AtomicInteger();

        assertThat(store(
                meterRegistry,
                () -> {
                    generatedIds.incrementAndGet();
                    return "candidate-id";
                }).append(message()))
                .isEqualTo(stored("candidate-id"));

        assertThat(generatedIds).hasValue(1);
        verify(transactionOperations, times(1)).execute(any());
        verify(mongoOperations, times(2)).findOne(
                any(),
                eq(MongoChatMessageDocument.class));
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "unknown_commit").count()).isZero();
    }

    @Test
    void unknownRecoveryReturnsConflictWhenCandidateDocumentContentDiffers() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit);
        MongoChatMessageDocument candidateDocument =
                document(
                        "candidate-id",
                        "room-1",
                        "user-1",
                        "client-1",
                        "different");
        stubIdempotencyMissThenCandidateDocument(
                candidateDocument);

        assertThat(store(meterRegistry).append(message()))
                .isEqualTo(new ConflictingChatMessage(
                        candidateDocument.toDomain()));

        verify(transactionOperations, times(1)).execute(any());
        verify(mongoOperations, times(2)).findOne(
                any(),
                eq(MongoChatMessageDocument.class));
    }

    @Test
    void unknownCandidateMessageIdOwnedByDifferentRequestIsPermanentCollision() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit);
        stubIdempotencyMissThenCandidateDocument(
                document(
                        "candidate-id",
                        "other-room",
                        "user-1",
                        "client-1",
                        "hello"));

        assertThatThrownBy(() ->
                store(meterRegistry).append(message()))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> {
                    ChatMessageStoreException storeException =
                            (ChatMessageStoreException) exception;
                    assertThat(storeException.kind()).isEqualTo(
                            ChatMessageStoreFailureKind.PERMANENT);
                    assertThat(storeException.retryable()).isFalse();
                });

        verify(transactionOperations, times(1)).execute(any());
        verify(mongoOperations, times(2)).findOne(
                any(),
                eq(MongoChatMessageDocument.class));
    }

    @Test
    void duplicateRecoveryUsesNormalContextForMatchingCandidateDocument() {
        when(transactionOperations.execute(any()))
                .thenThrow(new DuplicateKeyException(
                        "concurrent insert"));
        MongoChatMessageDocument candidateDocument =
                document("candidate-id");
        stubIdempotencyMissThenCandidateDocument(
                candidateDocument);

        assertThat(store(meterRegistry).append(message()))
                .isEqualTo(new DuplicateChatMessage(
                        candidateDocument.toDomain()));

        verify(transactionOperations, times(1)).execute(any());
        verify(mongoOperations, times(2)).findOne(
                any(),
                eq(MongoChatMessageDocument.class));
    }

    @Test
    void duplicateCandidateMessageIdOwnedByDifferentRequestIsPermanentCollision() {
        when(transactionOperations.execute(any()))
                .thenThrow(new DuplicateKeyException(
                        "concurrent insert"));
        stubIdempotencyMissThenCandidateDocument(
                document(
                        "candidate-id",
                        "room-1",
                        "other-user",
                        "client-1",
                        "hello"));

        assertThatThrownBy(() ->
                store(meterRegistry).append(message()))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> {
                    ChatMessageStoreException storeException =
                            (ChatMessageStoreException) exception;
                    assertThat(storeException.kind()).isEqualTo(
                            ChatMessageStoreFailureKind.PERMANENT);
                    assertThat(storeException.retryable()).isFalse();
                });

        verify(transactionOperations, times(1)).execute(any());
        verify(mongoOperations, times(2)).findOne(
                any(),
                eq(MongoChatMessageDocument.class));
    }

    @Test
    void unknownCommitRetryLimitProducesOutcomeUnknown() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit);

        assertThatThrownBy(() ->
                store(meterRegistry).append(message()))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> {
                    ChatMessageStoreException storeException =
                            (ChatMessageStoreException) exception;
                    assertThat(storeException.kind()).isEqualTo(
                            ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
                    assertThat(storeException.retryable()).isTrue();
                });

        verify(transactionOperations, times(
                MongoChatMessageStore.MAX_TRANSACTION_ATTEMPTS))
                .execute(any());
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "unknown_commit").count()).isEqualTo(2);
    }

    @Test
    void unknownThenPermanentFailureRemainsOutcomeUnknown() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit)
                .thenThrow(new MongoException(
                        13,
                        "not authorized"));

        assertThatThrownBy(() ->
                store(meterRegistry).append(message()))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> {
                    ChatMessageStoreException storeException =
                            (ChatMessageStoreException) exception;
                    assertThat(storeException.kind()).isEqualTo(
                            ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
                    assertThat(storeException.retryable()).isTrue();
                });

        verify(transactionOperations, times(2)).execute(any());
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "unknown_commit").count()).isEqualTo(1);
    }

    @Test
    void unknownRecoveryLookupTransientThenCandidateIsStored() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit)
                .thenAnswer(executeTransactionCallback());
        when(mongoOperations.findOne(
                any(),
                eq(MongoChatMessageDocument.class)))
                .thenThrow(new MongoTimeoutException(
                        "recovery lookup timed out"))
                .thenReturn(document("candidate-id"));
        AtomicInteger generatedIds = new AtomicInteger();

        assertThat(store(
                meterRegistry,
                () -> {
                    generatedIds.incrementAndGet();
                    return "candidate-id";
                }).append(message()))
                .isEqualTo(stored("candidate-id"));

        assertThat(generatedIds).hasValue(1);
        verify(transactionOperations, times(2)).execute(any());
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "unknown_commit").count()).isEqualTo(1);
    }

    @Test
    void unknownRecoveryLookupPermanentRemainsOutcomeUnknown() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit);
        when(mongoOperations.findOne(
                any(),
                eq(MongoChatMessageDocument.class)))
                .thenThrow(new MongoException(
                        13,
                        "not authorized"));

        assertThatThrownBy(() ->
                store(meterRegistry).append(message()))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> {
                    ChatMessageStoreException storeException =
                            (ChatMessageStoreException) exception;
                    assertThat(storeException.kind()).isEqualTo(
                            ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
                    assertThat(storeException.retryable()).isTrue();
                });

        verify(transactionOperations, times(1)).execute(any());
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "unknown_commit").count()).isZero();
    }

    @Test
    void duplicateLookupTransientThenNormalExistingIsDuplicate() {
        when(transactionOperations.execute(any()))
                .thenThrow(new DuplicateKeyException(
                        "concurrent insert"))
                .thenAnswer(executeTransactionCallback());
        when(mongoOperations.findOne(
                any(),
                eq(MongoChatMessageDocument.class)))
                .thenThrow(new MongoTimeoutException(
                        "duplicate lookup timed out"))
                .thenReturn(document("candidate-id"));

        assertThat(store(meterRegistry).append(message()))
                .isEqualTo(new DuplicateChatMessage(
                        stored("candidate-id").message()));

        verify(transactionOperations, times(2)).execute(any());
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "duplicate_race").count()).isEqualTo(1);
    }

    @Test
    void duplicateLookupTransientRetryExhaustionIsTransient() {
        when(transactionOperations.execute(any()))
                .thenThrow(new DuplicateKeyException(
                        "concurrent insert"));
        when(mongoOperations.findOne(
                any(),
                eq(MongoChatMessageDocument.class)))
                .thenThrow(new MongoTimeoutException(
                        "duplicate lookup timed out"));

        assertThatThrownBy(() ->
                store(meterRegistry).append(message()))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> {
                    ChatMessageStoreException storeException =
                            (ChatMessageStoreException) exception;
                    assertThat(storeException.kind()).isEqualTo(
                            ChatMessageStoreFailureKind.TRANSIENT);
                    assertThat(storeException.retryable()).isTrue();
                });

        verify(transactionOperations, times(
                MongoChatMessageStore.MAX_TRANSACTION_ATTEMPTS))
                .execute(any());
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "duplicate_race").count()).isEqualTo(2);
    }

    @Test
    void unknownThenTransientRetryExhaustionRemainsOutcomeUnknown() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        MongoException transientFailure =
                labelled(
                        MongoException
                                .TRANSIENT_TRANSACTION_ERROR_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit)
                .thenThrow(transientFailure)
                .thenThrow(transientFailure);

        assertThatThrownBy(() ->
                store(meterRegistry).append(message()))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> {
                    ChatMessageStoreException storeException =
                            (ChatMessageStoreException) exception;
                    assertThat(storeException.kind()).isEqualTo(
                            ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
                    assertThat(storeException.retryable()).isTrue();
                });

        verify(transactionOperations, times(
                MongoChatMessageStore.MAX_TRANSACTION_ATTEMPTS))
                .execute(any());
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "unknown_commit").count()).isEqualTo(1);
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "transient_transaction").count()).isEqualTo(1);
    }

    @Test
    void unknownThenNextTransactionSuccessUsesSingleCandidate() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        StoredChatMessage stored = stored("candidate-id");
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit)
                .thenReturn(stored);
        AtomicInteger generatedIds = new AtomicInteger();

        assertThat(store(
                meterRegistry,
                () -> {
                    generatedIds.incrementAndGet();
                    return "candidate-id";
                }).append(message()))
                .isEqualTo(stored);

        assertThat(generatedIds).hasValue(1);
        verify(transactionOperations, times(2)).execute(any());
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "unknown_commit").count()).isEqualTo(1);
    }

    @Test
    void programmingErrorAfterUnknownCommitIsNotHidden() {
        MongoException unknownCommit =
                labelled(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(unknownCommit)
                .thenThrow(new IllegalStateException(
                        "programming error"));

        assertThatThrownBy(() ->
                store(meterRegistry).append(message()))
                .isInstanceOf(IllegalStateException.class)
                .isNotInstanceOf(ChatMessageStoreException.class)
                .hasMessage("programming error");
    }

    @Test
    void transientRetryLimitIsBounded() {
        MongoException transientFailure =
                labelled(
                        MongoException
                                .TRANSIENT_TRANSACTION_ERROR_LABEL);
        when(transactionOperations.execute(any()))
                .thenThrow(transientFailure);

        assertThatThrownBy(() ->
                store(meterRegistry).append(message()))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> assertThat(
                        ((ChatMessageStoreException) exception).kind())
                        .isEqualTo(
                                ChatMessageStoreFailureKind.TRANSIENT));

        verify(transactionOperations, times(
                MongoChatMessageStore.MAX_TRANSACTION_ATTEMPTS))
                .execute(any());
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "transient_transaction").count()).isEqualTo(2);
    }

    @Test
    void unresolvedDuplicateRaceRetriesWholeTransaction() {
        StoredChatMessage stored = stored("candidate-id");
        when(transactionOperations.execute(any()))
                .thenThrow(new DuplicateKeyException(
                        "concurrent counter upsert"))
                .thenReturn(stored);

        assertThat(store(meterRegistry).append(message()))
                .isEqualTo(stored);

        verify(transactionOperations, times(2)).execute(any());
        assertThat(meterRegistry.counter(
                RETRY_METRIC,
                "reason",
                "duplicate_race").count()).isEqualTo(1);
    }

    @Test
    void permanentMongoFailureIsNotRetried() {
        when(transactionOperations.execute(any()))
                .thenThrow(new MongoException(
                        13,
                        "not authorized"));

        assertThatThrownBy(() ->
                store(meterRegistry).append(message()))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> {
                    ChatMessageStoreException storeException =
                            (ChatMessageStoreException) exception;
                    assertThat(storeException.kind()).isEqualTo(
                            ChatMessageStoreFailureKind.PERMANENT);
                    assertThat(storeException.retryable()).isFalse();
                });

        verify(transactionOperations, times(1)).execute(any());
    }

    @Test
    void retryMetricFailureDoesNotChangeStoredResult() {
        SimpleMeterRegistry throwingRegistry =
                spy(new SimpleMeterRegistry());
        doReturn(ThrowingMeterRegistry.throwingCounter())
                .when(throwingRegistry)
                .counter(eq(RETRY_METRIC), any(String[].class));
        MongoException transientFailure =
                labelled(
                        MongoException
                                .TRANSIENT_TRANSACTION_ERROR_LABEL);
        StoredChatMessage stored = stored("candidate-id");
        when(transactionOperations.execute(any()))
                .thenThrow(transientFailure)
                .thenReturn(stored);

        assertThat(store(throwingRegistry).append(message()))
                .isEqualTo(stored);
    }

    private MongoChatMessageStore store(
            SimpleMeterRegistry registry
    ) {
        return store(registry, () -> "candidate-id");
    }

    private MongoChatMessageStore store(
            SimpleMeterRegistry registry,
            Supplier<String> messageIdGenerator
    ) {
        return new MongoChatMessageStore(
                mongoOperations,
                transactionOperations,
                Clock.fixed(NOW, ZoneOffset.UTC),
                messageIdGenerator,
                new MongoChatMessageExceptionClassifier(),
                message -> {
                },
                mock(RoomInboxSummaryWriter.class),
                registry);
    }

    private NewChatMessage message() {
        return new NewChatMessage(
                "room-1",
                "user-1",
                "client-1",
                "hello");
    }

    private StoredChatMessage stored(String messageId) {
        return new StoredChatMessage(
                new ChatMessage(
                        messageId,
                        "room-1",
                        1L,
                        "user-1",
                        "client-1",
                        "hello",
                        NOW));
    }

    private MongoChatMessageDocument document(String messageId) {
        return document(
                messageId,
                "room-1",
                "user-1",
                "client-1",
                "hello");
    }

    private MongoChatMessageDocument document(
            String messageId,
            String roomId,
            String senderUserId,
            String clientMessageId,
            String content
    ) {
        return new MongoChatMessageDocument(
                messageId,
                MongoChatMessageDocument.CURRENT_SCHEMA_VERSION,
                roomId,
                1L,
                senderUserId,
                clientMessageId,
                content,
                NOW);
    }

    private void stubIdempotencyMissThenCandidateDocument(
            MongoChatMessageDocument candidateDocument
    ) {
        AtomicInteger lookupCalls = new AtomicInteger();
        when(mongoOperations.findOne(
                any(),
                eq(MongoChatMessageDocument.class)))
                .thenAnswer(invocation -> {
                    Query query = invocation.getArgument(0);
                    int call = lookupCalls.incrementAndGet();
                    if (call == 1) {
                        java.util.List<org.bson.Document> criteria =
                                query.getQueryObject().getList(
                                        "$and",
                                        org.bson.Document.class);
                        assertThat(criteria)
                                .contains(
                                        new org.bson.Document(
                                                "roomId",
                                                "room-1"),
                                        new org.bson.Document(
                                                "senderUserId",
                                                "user-1"),
                                        new org.bson.Document(
                                                "clientMessageId",
                                                "client-1"));
                        return null;
                    }
                    assertThat(call).isEqualTo(2);
                    assertThat(query.getQueryObject())
                            .containsEntry("_id", "candidate-id");
                    return candidateDocument;
                });
    }

    private MongoException labelled(String label) {
        MongoException exception = new MongoException(label);
        exception.addLabel(label);
        return exception;
    }

    private Answer<StoreChatMessageResult>
    executeTransactionCallback() {
        return invocation -> {
            TransactionCallback<StoreChatMessageResult> callback =
                    invocation.getArgument(0);
            return callback.doInTransaction(
                    mock(TransactionStatus.class));
        };
    }
}
