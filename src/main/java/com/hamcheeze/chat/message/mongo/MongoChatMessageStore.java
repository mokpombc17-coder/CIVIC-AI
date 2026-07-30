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
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxWriter;
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
    private final ChatMessageOutboxWriter outboxWriter;
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
            ChatMessageOutboxWriter outboxWriter,
            MeterRegistry meterRegistry
    ) {
        this(
                mongoOperations,
                (TransactionOperations) transactionTemplate,
                clock,
                messageIdGenerator,
                exceptionClassifier,
                outboxWriter,
                meterRegistry);
    }

    MongoChatMessageStore(
            MongoOperations mongoOperations,
            TransactionOperations transactionOperations,
            Clock clock,
            Supplier<String> messageIdGenerator,
            MongoChatMessageExceptionClassifier exceptionClassifier,
            ChatMessageOutboxWriter outboxWriter,
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
        this.outboxWriter = Objects.requireNonNull(
                outboxWriter,
                "outboxWriter");
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
        boolean unresolvedUnknownCommitSeen = false;
        Throwable unknownCommitCause = null;
        for (int attempt = 1;
             attempt <= MAX_TRANSACTION_ATTEMPTS;
             attempt++) {
            ExistingMessageResolutionContext resolutionContext =
                    unresolvedUnknownCommitSeen
                            ? ExistingMessageResolutionContext
                            .UNKNOWN_COMMIT_RECOVERY
                            : ExistingMessageResolutionContext
                            .NORMAL_APPEND;
            try {
                StoreChatMessageResult result =
                        transactionOperations.execute(status ->
                                appendInTransaction(
                                        newMessage,
                                        candidateMessageId,
                                        candidateCreatedAt,
                                        resolutionContext));
                return Objects.requireNonNull(
                        result,
                        "transaction returned null");
            } catch (RuntimeException exception) {
                if (exceptionClassifier.isDuplicateKey(exception)) {
                    StoreChatMessageResult resolved;
                    try {
                        resolved = resolveDuplicateKey(
                                newMessage,
                                candidateMessageId,
                                resolutionContext);
                    } catch (RuntimeException resolutionFailure) {
                        Optional<ChatMessageStoreFailureKind>
                                resolutionKind =
                                exceptionClassifier.classify(
                                        resolutionFailure);
                        if (resolutionKind.isEmpty()) {
                            throw resolutionFailure;
                        }
                        if (resolutionKind.get()
                                != ChatMessageStoreFailureKind.PERMANENT
                                && attempt
                                < MAX_TRANSACTION_ATTEMPTS) {
                            backoffBeforeRetry(
                                    attempt,
                                    unresolvedUnknownCommitSeen,
                                    unknownCommitCause);
                            recordRetry(
                                    RetryReason.DUPLICATE_RACE);
                            continue;
                        }
                        throw classifiedFailure(
                                resolutionKind.get(),
                                unresolvedUnknownCommitSeen,
                                unknownCommitCause,
                                "MongoDB duplicate result lookup failed",
                                resolutionFailure);
                    }
                    if (resolved != null) {
                        return resolved;
                    }
                    if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                        backoffBeforeRetry(
                                attempt,
                                unresolvedUnknownCommitSeen,
                                unknownCommitCause);
                        recordRetry(RetryReason.DUPLICATE_RACE);
                        continue;
                    }
                    throw classifiedFailure(
                            ChatMessageStoreFailureKind.TRANSIENT,
                            unresolvedUnknownCommitSeen,
                            unknownCommitCause,
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
                    if (!unresolvedUnknownCommitSeen) {
                        unresolvedUnknownCommitSeen = true;
                        unknownCommitCause = exception;
                    }
                    StoreChatMessageResult resolved;
                    try {
                        resolved = resolveUnknownCommit(
                                newMessage,
                                candidateMessageId);
                    } catch (RuntimeException resolutionFailure) {
                        Optional<ChatMessageStoreFailureKind>
                                resolutionKind =
                                exceptionClassifier.classify(
                                        resolutionFailure);
                        if (resolutionKind.isEmpty()) {
                            throw resolutionFailure;
                        }
                        if (resolutionKind.get()
                                != ChatMessageStoreFailureKind.PERMANENT
                                && attempt
                                < MAX_TRANSACTION_ATTEMPTS) {
                            backoffBeforeRetry(
                                    attempt,
                                    unresolvedUnknownCommitSeen,
                                    unknownCommitCause);
                            recordRetry(RetryReason.UNKNOWN_COMMIT);
                            continue;
                        }
                        throw classifiedFailure(
                                ChatMessageStoreFailureKind
                                        .OUTCOME_UNKNOWN,
                                true,
                                unknownCommitCause,
                                "MongoDB unknown commit result lookup "
                                        + "failed",
                                resolutionFailure);
                    }
                    if (resolved != null) {
                        return resolved;
                    }
                    if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                        backoffBeforeRetry(
                                attempt,
                                unresolvedUnknownCommitSeen,
                                unknownCommitCause);
                        recordRetry(RetryReason.UNKNOWN_COMMIT);
                        continue;
                    }
                    throw classifiedFailure(
                            ChatMessageStoreFailureKind.OUTCOME_UNKNOWN,
                            true,
                            unknownCommitCause,
                            "MongoDB transaction outcome could not be "
                                    + "determined",
                            exception);
                }

                if (kind == ChatMessageStoreFailureKind.TRANSIENT) {
                    if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                        backoffBeforeRetry(
                                attempt,
                                unresolvedUnknownCommitSeen,
                                unknownCommitCause);
                        recordRetry(
                                RetryReason.TRANSIENT_TRANSACTION);
                        continue;
                    }
                    throw classifiedFailure(
                            ChatMessageStoreFailureKind.TRANSIENT,
                            unresolvedUnknownCommitSeen,
                            unknownCommitCause,
                            "MongoDB transaction retry limit exceeded",
                            exception);
                }

                throw classifiedFailure(
                        ChatMessageStoreFailureKind.PERMANENT,
                        unresolvedUnknownCommitSeen,
                        unknownCommitCause,
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
            Instant candidateCreatedAt,
            ExistingMessageResolutionContext resolutionContext
    ) {
        MongoChatMessageDocument existing =
                findByIdempotencyKey(newMessage);
        if (existing != null) {
            return resultForExisting(
                    existing,
                    newMessage,
                    candidateMessageId,
                    resolutionContext);
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
        ChatMessage storedMessage = document.toDomain();
        outboxWriter.appendMessageCreated(storedMessage);
        return new StoredChatMessage(storedMessage);
    }

    private StoreChatMessageResult resolveDuplicateKey(
            NewChatMessage newMessage,
            String candidateMessageId,
            ExistingMessageResolutionContext resolutionContext
    ) {
        MongoChatMessageDocument existing =
                findByIdempotencyKey(newMessage);
        if (existing != null) {
            return resultForExisting(
                    existing,
                    newMessage,
                    candidateMessageId,
                    resolutionContext);
        }

        MongoChatMessageDocument messageIdCollision =
                findByMessageId(candidateMessageId);
        if (messageIdCollision != null) {
            return resolveCandidateMessageDocument(
                    messageIdCollision,
                    newMessage,
                    candidateMessageId,
                    resolutionContext);
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
                    candidateMessageId,
                    ExistingMessageResolutionContext
                            .UNKNOWN_COMMIT_RECOVERY);
        }

        MongoChatMessageDocument messageIdCollision =
                findByMessageId(candidateMessageId);
        if (messageIdCollision != null) {
            return resolveCandidateMessageDocument(
                    messageIdCollision,
                    newMessage,
                    candidateMessageId,
                    ExistingMessageResolutionContext
                            .UNKNOWN_COMMIT_RECOVERY);
        }
        return null;
    }

    private StoreChatMessageResult resolveCandidateMessageDocument(
            MongoChatMessageDocument candidateDocument,
            NewChatMessage newMessage,
            String candidateMessageId,
            ExistingMessageResolutionContext resolutionContext
    ) {
        if (!hasSameIdempotencyKey(
                candidateDocument,
                newMessage)) {
            throw failure(
                    ChatMessageStoreFailureKind.PERMANENT,
                    "Generated duplicate messageId: "
                            + candidateMessageId,
                    null);
        }

        return resultForExisting(
                candidateDocument,
                newMessage,
                candidateMessageId,
                resolutionContext);
    }

    private boolean hasSameIdempotencyKey(
            MongoChatMessageDocument document,
            NewChatMessage message
    ) {
        return document.roomId().equals(message.roomId())
                && document.senderUserId().equals(
                message.senderUserId())
                && document.clientMessageId().equals(
                message.clientMessageId());
    }

    private StoreChatMessageResult resultForExisting(
            MongoChatMessageDocument existing,
            NewChatMessage newMessage,
            String candidateMessageId,
            ExistingMessageResolutionContext resolutionContext
    ) {
        ChatMessage message = existing.toDomain();
        if (!existing.content().equals(newMessage.content())) {
            return new ConflictingChatMessage(message);
        }
        if (resolutionContext
                == ExistingMessageResolutionContext
                .UNKNOWN_COMMIT_RECOVERY
                && existing.messageId().equals(candidateMessageId)) {
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

    private ChatMessageStoreException classifiedFailure(
            ChatMessageStoreFailureKind classifiedKind,
            boolean unresolvedUnknownCommitSeen,
            Throwable unknownCommitCause,
            String message,
            Throwable currentCause
    ) {
        if (!unresolvedUnknownCommitSeen) {
            return failure(
                    classifiedKind,
                    message,
                    currentCause);
        }

        ChatMessageStoreException outcomeUnknown =
                failure(
                        ChatMessageStoreFailureKind.OUTCOME_UNKNOWN,
                        message,
                        unknownCommitCause);
        if (currentCause != null
                && currentCause != unknownCommitCause) {
            outcomeUnknown.addSuppressed(currentCause);
        }
        return outcomeUnknown;
    }

    private void recordRetry(RetryReason reason) {
        BestEffortMetricRecorder.increment(
                RETRY_METRIC,
                retryCounters.get(reason));
    }

    private void backoffBeforeRetry(
            int completedAttempt,
            boolean unresolvedUnknownCommitSeen,
            Throwable unknownCommitCause
    ) {
        try {
            Thread.sleep(
                    RETRY_BACKOFF_MILLIS * completedAttempt);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw classifiedFailure(
                    ChatMessageStoreFailureKind.TRANSIENT,
                    unresolvedUnknownCommitSeen,
                    unknownCommitCause,
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

    private enum ExistingMessageResolutionContext {
        NORMAL_APPEND,
        UNKNOWN_COMMIT_RECOVERY
    }

    private enum AppendResult {
        STORED,
        DUPLICATE,
        CONFLICT,
        FAILURE
    }
}
