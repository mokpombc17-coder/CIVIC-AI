package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.metrics.ThrowingMeterRegistry;
import com.mongodb.MongoException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

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
        return new MongoChatMessageDocument(
                messageId,
                MongoChatMessageDocument.CURRENT_SCHEMA_VERSION,
                "room-1",
                1L,
                "user-1",
                "client-1",
                "hello",
                NOW);
    }

    private MongoException labelled(String label) {
        MongoException exception = new MongoException(label);
        exception.addLabel(label);
        return exception;
    }
}
