package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import com.hamcheeze.chat.message.ConflictingChatMessage;
import com.hamcheeze.chat.message.DuplicateChatMessage;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoreChatMessageResult;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Supplier;

public final class MongoChatMessageStore implements ChatMessageStore {

    static final int MAX_TRANSACTION_ATTEMPTS = 3;
    private static final long RETRY_BACKOFF_MILLIS = 10L;

    private static final String STORED_METRIC =
            "chat.message.store.stored";
    private static final String DUPLICATE_METRIC =
            "chat.message.store.duplicate";
    private static final String CONFLICT_METRIC =
            "chat.message.store.conflicts";
    private static final String FAILURE_METRIC =
            "chat.message.store.failures";
    private static final String DURATION_METRIC =
            "chat.message.store.append.duration";
    private static final String RETRY_METRIC =
            "chat.message.store.transaction.retries";

    private final MongoOperations mongoOperations;
    private final TransactionOperations transactionOperations;
    private final Clock clock;
    private final Supplier<String> messageIdGenerator;
    private final MongoChatMessageExceptionClassifier exceptionClassifier;
    private final MongoRoomSequenceAllocator sequenceAllocator;
    private final Counter storedCounter;
    private final Counter duplicateCounter;
    private final Counter conflictCounter;
    private final Counter failureCounter;
    private final Map<RetryReason, Counter> retryCounters;
    private final Map<AppendResult, Timer> appendTimers;

    public MongoChatMessageStore(
            MongoOperations mongoOperations,
            TransactionTemplate transactionTemplate,
            Clock clock,
            Supplier<String> messageIdGenerator,
            MongoChatMessageExceptionClassifier exceptionClassifier,
            MeterRegistry meterRegistry
    ) {
        this(
                mongoOperations,
                (TransactionOperations) transactionTemplate,
                clock,
                messageIdGenerator,
                exceptionClassifier,
                meterRegistry);
    }

    MongoChatMessageStore(
            MongoOperations mongoOperations,
            TransactionOperations transactionOperations,
            Clock clock,
            Supplier<String> messageIdGenerator,
            MongoChatMessageExceptionClassifier exceptionClassifier,
            MeterRegistry meterRegistry
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
        this.transactionOperations = Objects.requireNonNull(
                transactionOperations,
                "transactionOperations");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.messageIdGenerator = Objects.requireNonNull(
                messageIdGenerator,
                "messageIdGenerator");
        this.exceptionClassifier = Objects.requireNonNull(
                exceptionClassifier,
                "exceptionClassifier");
        this.sequenceAllocator =
                new MongoRoomSequenceAllocator(mongoOperations);
        Objects.requireNonNull(meterRegistry, "meterRegistry");

        this.storedCounter = meterRegistry.counter(STORED_METRIC);
        this.duplicateCounter = meterRegistry.counter(DUPLICATE_METRIC);
        this.conflictCounter = meterRegistry.counter(CONFLICT_METRIC);
        this.failureCounter = meterRegistry.counter(FAILURE_METRIC);
        this.retryCounters = Map.of(
                RetryReason.TRANSIENT_TRANSACTION,
                meterRegistry.counter(
                        RETRY_METRIC,
                        "reason",
                        "transient_transaction"),
                RetryReason.UNKNOWN_COMMIT,
                meterRegistry.counter(
                        RETRY_METRIC,
                        "reason",
                        "unknown_commit"),
                RetryReason.DUPLICATE_RACE,
                meterRegistry.counter(
                        RETRY_METRIC,
                        "reason",
                        "duplicate_race"));
        this.appendTimers = Map.of(
                AppendResult.STORED,
                meterRegistry.timer(
                        DURATION_METRIC,
                        "result",
                        "stored"),
                AppendResult.DUPLICATE,
                meterRegistry.timer(
                        DURATION_METRIC,
                        "result",
                        "duplicate"),
                AppendResult.CONFLICT,
                meterRegistry.timer(
                        DURATION_METRIC,
                        "result",
                        "conflict"),
                AppendResult.FAILURE,
                meterRegistry.timer(
                        DURATION_METRIC,
                        "result",
                        "failure"));
    }

    @Override
    public StoreChatMessageResult append(NewChatMessage newMessage) {
        Objects.requireNonNull(newMessage, "newMessage");
        long startedAtNanos = System.nanoTime();
        try {
            String candidateMessageId = Objects.requireNonNull(
                    messageIdGenerator.get(),
                    "messageIdGenerator returned null");
            Instant candidateCreatedAt = Objects.requireNonNull(
                    clock.instant(),
                    "clock returned null");

            StoreChatMessageResult result = appendWithRetries(
                    newMessage,
                    candidateMessageId,
                    candidateCreatedAt);
            recordResult(result, startedAtNanos);
            return result;
        } catch (ChatMessageStoreException exception) {
            recordFailure(startedAtNanos);
            throw exception;
        } catch (RuntimeException exception) {
            Optional<ChatMessageStoreFailureKind> kind =
                    exceptionClassifier.classify(exception);
            recordFailure(startedAtNanos);
            if (kind.isPresent()) {
                throw new ChatMessageStoreException(
                        kind.get(),
                        "MongoDB chat message append failed",
                        exception);
            }
            throw exception;
        }
    }

    private StoreChatMessageResult appendWithRetries(
            NewChatMessage newMessage,
            String candidateMessageId,
            Instant candidateCreatedAt
    ) {
        for (int attempt = 1;
             attempt <= MAX_TRANSACTION_ATTEMPTS;
             attempt++) {
            try {
                StoreChatMessageResult result =
                        transactionOperations.execute(status ->
                                appendInTransaction(
                                        newMessage,
                                        candidateMessageId,
                                        candidateCreatedAt));
                return Objects.requireNonNull(
                        result,
                        "transaction returned null");
            } catch (RuntimeException exception) {
                if (exceptionClassifier.isDuplicateKey(exception)) {
                    StoreChatMessageResult resolved =
                            resolveDuplicateKey(
                                    newMessage,
                                    candidateMessageId);
                    if (resolved != null) {
                        return resolved;
                    }
                    if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                        backoffBeforeRetry(attempt);
                        recordRetry(RetryReason.DUPLICATE_RACE);
                        continue;
                    }
                    throw failure(
                            ChatMessageStoreFailureKind.TRANSIENT,
                            "MongoDB duplicate race retry limit exceeded",
                            exception);
                }

                Optional<ChatMessageStoreFailureKind> classification =
                        exceptionClassifier.classify(exception);
                if (classification.isEmpty()) {
                    throw exception;
                }

                ChatMessageStoreFailureKind kind =
                        classification.get();
                if (kind == ChatMessageStoreFailureKind.OUTCOME_UNKNOWN) {
                    StoreChatMessageResult resolved =
                            resolveUnknownCommit(
                                    newMessage,
                                    candidateMessageId);
                    if (resolved != null) {
                        return resolved;
                    }
                    if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                        backoffBeforeRetry(attempt);
                        recordRetry(RetryReason.UNKNOWN_COMMIT);
                        continue;
                    }
                    throw failure(
                            ChatMessageStoreFailureKind.OUTCOME_UNKNOWN,
                            "MongoDB transaction outcome could not be "
                                    + "determined",
                            exception);
                }

                if (kind == ChatMessageStoreFailureKind.TRANSIENT) {
                    if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                        backoffBeforeRetry(attempt);
                        recordRetry(
                                RetryReason.TRANSIENT_TRANSACTION);
                        continue;
                    }
                    throw failure(
                            ChatMessageStoreFailureKind.TRANSIENT,
                            "MongoDB transaction retry limit exceeded",
                            exception);
                }

                throw failure(
                        ChatMessageStoreFailureKind.PERMANENT,
                        "Permanent MongoDB message store failure",
                        exception);
            }
        }
        throw new IllegalStateException(
                "Transaction retry loop exited unexpectedly");
    }

    private StoreChatMessageResult appendInTransaction(
            NewChatMessage newMessage,
            String candidateMessageId,
            Instant candidateCreatedAt
    ) {
        MongoChatMessageDocument existing =
                findByIdempotencyKey(newMessage);
        if (existing != null) {
            return resultForExisting(
                    existing,
                    newMessage,
                    candidateMessageId);
        }

        long roomSequence =
                sequenceAllocator.next(newMessage.roomId());
        MongoChatMessageDocument document =
                new MongoChatMessageDocument(
                        candidateMessageId,
                        MongoChatMessageDocument
                                .CURRENT_SCHEMA_VERSION,
                        newMessage.roomId(),
                        roomSequence,
                        newMessage.senderUserId(),
                        newMessage.clientMessageId(),
                        newMessage.content(),
                        candidateCreatedAt);
        mongoOperations.insert(document);
        return new StoredChatMessage(document.toDomain());
    }

    private StoreChatMessageResult resolveDuplicateKey(
            NewChatMessage newMessage,
            String candidateMessageId
    ) {
        MongoChatMessageDocument existing =
                findByIdempotencyKey(newMessage);
        if (existing != null) {
            return resultForExisting(
                    existing,
                    newMessage,
                    candidateMessageId);
        }

        MongoChatMessageDocument messageIdCollision =
                findByMessageId(candidateMessageId);
        if (messageIdCollision != null) {
            throw failure(
                    ChatMessageStoreFailureKind.PERMANENT,
                    "Generated duplicate messageId: "
                            + candidateMessageId,
                    null);
        }
        return null;
    }

    private StoreChatMessageResult resolveUnknownCommit(
            NewChatMessage newMessage,
            String candidateMessageId
    ) {
        MongoChatMessageDocument existing =
                findByIdempotencyKey(newMessage);
        if (existing != null) {
            return resultForExisting(
                    existing,
                    newMessage,
                    candidateMessageId);
        }

        MongoChatMessageDocument messageIdCollision =
                findByMessageId(candidateMessageId);
        if (messageIdCollision != null) {
            throw failure(
                    ChatMessageStoreFailureKind.PERMANENT,
                    "Generated duplicate messageId: "
                            + candidateMessageId,
                    null);
        }
        return null;
    }

    private StoreChatMessageResult resultForExisting(
            MongoChatMessageDocument existing,
            NewChatMessage newMessage,
            String candidateMessageId
    ) {
        ChatMessage message = existing.toDomain();
        if (!existing.content().equals(newMessage.content())) {
            return new ConflictingChatMessage(message);
        }
        if (existing.messageId().equals(candidateMessageId)) {
            return new StoredChatMessage(message);
        }
        return new DuplicateChatMessage(message);
    }

    private MongoChatMessageDocument findByIdempotencyKey(
            NewChatMessage message
    ) {
        Query query = Query.query(new Criteria().andOperator(
                Criteria.where("roomId").is(message.roomId()),
                Criteria.where("senderUserId")
                        .is(message.senderUserId()),
                Criteria.where("clientMessageId")
                        .is(message.clientMessageId())));
        return mongoOperations.findOne(
                query,
                MongoChatMessageDocument.class);
    }

    private MongoChatMessageDocument findByMessageId(
            String messageId
    ) {
        return mongoOperations.findOne(
                Query.query(Criteria.where("_id").is(messageId)),
                MongoChatMessageDocument.class);
    }

    private ChatMessageStoreException failure(
            ChatMessageStoreFailureKind kind,
            String message,
            Throwable cause
    ) {
        return new ChatMessageStoreException(kind, message, cause);
    }

    private void recordRetry(RetryReason reason) {
        BestEffortMetricRecorder.increment(
                RETRY_METRIC,
                retryCounters.get(reason));
    }

    private void backoffBeforeRetry(int completedAttempt) {
        try {
            Thread.sleep(
                    RETRY_BACKOFF_MILLIS * completedAttempt);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure(
                    ChatMessageStoreFailureKind.TRANSIENT,
                    "MongoDB transaction retry interrupted",
                    exception);
        }
    }

    private void recordResult(
            StoreChatMessageResult result,
            long startedAtNanos
    ) {
        AppendResult appendResult;
        if (result instanceof StoredChatMessage) {
            appendResult = AppendResult.STORED;
            BestEffortMetricRecorder.increment(
                    STORED_METRIC,
                    storedCounter);
        } else if (result instanceof DuplicateChatMessage) {
            appendResult = AppendResult.DUPLICATE;
            BestEffortMetricRecorder.increment(
                    DUPLICATE_METRIC,
                    duplicateCounter);
        } else if (result instanceof ConflictingChatMessage) {
            appendResult = AppendResult.CONFLICT;
            BestEffortMetricRecorder.increment(
                    CONFLICT_METRIC,
                    conflictCounter);
        } else {
            throw new IllegalStateException(
                    "Unsupported store result: "
                            + result.getClass().getName());
        }
        recordDuration(appendResult, startedAtNanos);
    }

    private void recordFailure(long startedAtNanos) {
        BestEffortMetricRecorder.increment(
                FAILURE_METRIC,
                failureCounter);
        recordDuration(AppendResult.FAILURE, startedAtNanos);
    }

    private void recordDuration(
            AppendResult result,
            long startedAtNanos
    ) {
        long elapsedNanos = Math.max(
                0L,
                System.nanoTime() - startedAtNanos);
        BestEffortMetricRecorder.record(
                DURATION_METRIC,
                appendTimers.get(result),
                Duration.ofNanos(elapsedNanos));
    }

    private enum RetryReason {
        TRANSIENT_TRANSACTION,
        UNKNOWN_COMMIT,
        DUPLICATE_RACE
    }

    private enum AppendResult {
        STORED,
        DUPLICATE,
        CONFLICT,
        FAILURE
    }
}
