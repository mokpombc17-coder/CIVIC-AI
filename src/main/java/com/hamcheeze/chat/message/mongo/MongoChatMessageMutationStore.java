package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.ChatMessageMutationResult;
import com.hamcheeze.chat.message.ChatMessageMutationStore;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import com.hamcheeze.chat.message.DeleteChatMessageMutation;
import com.hamcheeze.chat.message.EditChatMessageMutation;
import com.hamcheeze.chat.message.MessageMutationCommandType;
import com.hamcheeze.chat.message.MessageMutationOutcome;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxWriter;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummaryWriter;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.transaction.support.TransactionOperations;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public final class MongoChatMessageMutationStore
        implements ChatMessageMutationStore {

    private static final int MAX_TRANSACTION_ATTEMPTS = 3;

    private final MongoOperations mongoOperations;
    private final TransactionOperations transactionOperations;
    private final Clock clock;
    private final MongoChatMessageExceptionClassifier exceptionClassifier;
    private final ChatMessageOutboxWriter outboxWriter;
    private final RoomInboxSummaryWriter summaryWriter;
    private final Map<MessageMutationOutcome, Counter> resultCounters =
            new EnumMap<>(MessageMutationOutcome.class);
    private final Counter failureCounter;
    private final Counter replayCounter;

    public MongoChatMessageMutationStore(
            MongoOperations mongoOperations,
            TransactionOperations transactionOperations,
            Clock clock,
            MongoChatMessageExceptionClassifier exceptionClassifier,
            ChatMessageOutboxWriter outboxWriter,
            RoomInboxSummaryWriter summaryWriter,
            MeterRegistry meterRegistry
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
        this.transactionOperations = Objects.requireNonNull(
                transactionOperations, "transactionOperations");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.exceptionClassifier = Objects.requireNonNull(
                exceptionClassifier, "exceptionClassifier");
        this.outboxWriter = Objects.requireNonNull(
                outboxWriter, "outboxWriter");
        this.summaryWriter = Objects.requireNonNull(
                summaryWriter, "summaryWriter");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        for (MessageMutationOutcome outcome
                : MessageMutationOutcome.values()) {
            resultCounters.put(
                    outcome,
                    Counter.builder("chat.message.mutation.results")
                            .tag("result", outcome.name().toLowerCase())
                            .register(meterRegistry));
        }
        failureCounter = meterRegistry.counter(
                "chat.message.mutation.persistence.failures");
        replayCounter = meterRegistry.counter(
                "chat.message.mutation.idempotency.replays");
    }

    @Override
    public ChatMessageMutationResult edit(
            EditChatMessageMutation mutation
    ) {
        Objects.requireNonNull(mutation, "mutation");
        return execute(
                MessageMutationCommandType.EDIT_MESSAGE,
                mutation.actorUserId(),
                mutation.clientMutationId(),
                mutation.roomId(),
                mutation.messageId(),
                fingerprint(
                        MessageMutationCommandType.EDIT_MESSAGE,
                        mutation.roomId(),
                        mutation.messageId(),
                        mutation.content()),
                mutation.content());
    }

    @Override
    public ChatMessageMutationResult delete(
            DeleteChatMessageMutation mutation
    ) {
        Objects.requireNonNull(mutation, "mutation");
        return execute(
                MessageMutationCommandType.DELETE_MESSAGE,
                mutation.actorUserId(),
                mutation.clientMutationId(),
                mutation.roomId(),
                mutation.messageId(),
                fingerprint(
                        MessageMutationCommandType.DELETE_MESSAGE,
                        mutation.roomId(),
                        mutation.messageId()),
                null);
    }

    private ChatMessageMutationResult execute(
            MessageMutationCommandType commandType,
            String actorUserId,
            String clientMutationId,
            String roomId,
            String messageId,
            String fingerprint,
            String editedContent
    ) {
        Instant processedAt = clock.instant();
        boolean unresolvedUnknownCommitSeen = false;
        Throwable unknownCommitCause = null;
        try {
            for (int attempt = 1;
                    attempt <= MAX_TRANSACTION_ATTEMPTS;
                    attempt++) {
                try {
                    ChatMessageMutationResult result =
                            transactionOperations.execute(status ->
                                    mutateInTransaction(
                                            commandType,
                                            actorUserId,
                                            clientMutationId,
                                            roomId,
                                            messageId,
                                            fingerprint,
                                            editedContent,
                                            processedAt));
                    return record(Objects.requireNonNull(
                            result, "transaction returned null"));
                } catch (RuntimeException exception) {
                    if (exceptionClassifier.isDuplicateKey(exception)) {
                        preserveUnknownFollowUp(
                                unresolvedUnknownCommitSeen,
                                unknownCommitCause,
                                exception);
                        ChatMessageMutationResult resolved;
                        try {
                            resolved = resolveReceipt(
                                        commandType,
                                        actorUserId,
                                        clientMutationId,
                                        messageId,
                                        fingerprint);
                        } catch (RuntimeException resolutionFailure) {
                            Optional<ChatMessageStoreFailureKind>
                                    resolutionKind =
                                    exceptionClassifier.classify(
                                            resolutionFailure);
                            if (resolutionKind.isEmpty()) {
                                if (!unresolvedUnknownCommitSeen) {
                                    throw resolutionFailure;
                                }
                                throw classifiedFailure(
                                        ChatMessageStoreFailureKind
                                                .OUTCOME_UNKNOWN,
                                        true,
                                        unknownCommitCause,
                                        "MongoDB duplicate receipt lookup "
                                                + "failed",
                                        resolutionFailure);
                            }
                            if (resolutionKind.get()
                                    == ChatMessageStoreFailureKind
                                    .OUTCOME_UNKNOWN
                                    && !unresolvedUnknownCommitSeen) {
                                unresolvedUnknownCommitSeen = true;
                                unknownCommitCause = resolutionFailure;
                                preserveUnknownFollowUp(
                                        true,
                                        unknownCommitCause,
                                        exception);
                            }
                            if (resolutionKind.get()
                                    != ChatMessageStoreFailureKind.PERMANENT
                                    && attempt
                                    < MAX_TRANSACTION_ATTEMPTS) {
                                preserveUnknownFollowUp(
                                        unresolvedUnknownCommitSeen,
                                        unknownCommitCause,
                                        resolutionFailure);
                                backoffBeforeRetry(
                                        attempt,
                                        unresolvedUnknownCommitSeen,
                                        unknownCommitCause);
                                continue;
                            }
                            throw classifiedFailure(
                                    resolutionKind.get(),
                                    unresolvedUnknownCommitSeen,
                                    unknownCommitCause,
                                    "MongoDB duplicate receipt lookup "
                                            + "failed",
                                    resolutionFailure);
                        }
                        if (resolved != null) {
                            return record(resolved);
                        }
                        if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                            backoffBeforeRetry(
                                    attempt,
                                    unresolvedUnknownCommitSeen,
                                    unknownCommitCause);
                            continue;
                        }
                        throw classifiedFailure(
                                ChatMessageStoreFailureKind.TRANSIENT,
                                unresolvedUnknownCommitSeen,
                                unknownCommitCause,
                                "MongoDB duplicate receipt race retry "
                                        + "limit exceeded",
                                exception);
                    }
                    Optional<ChatMessageStoreFailureKind> classified =
                            exceptionClassifier.classify(exception);
                    if (classified.isEmpty()) {
                        throw classifiedFailure(
                                ChatMessageStoreFailureKind.PERMANENT,
                                unresolvedUnknownCommitSeen,
                                unknownCommitCause,
                                "MongoDB message mutation failed",
                                exception);
                    }

                    ChatMessageStoreFailureKind kind =
                            classified.get();
                    if (kind
                            == ChatMessageStoreFailureKind.OUTCOME_UNKNOWN) {
                        if (!unresolvedUnknownCommitSeen) {
                            unresolvedUnknownCommitSeen = true;
                            unknownCommitCause = exception;
                        } else {
                            preserveUnknownFollowUp(
                                    true,
                                    unknownCommitCause,
                                    exception);
                        }
                        ChatMessageMutationResult resolved;
                        try {
                            resolved = resolveReceipt(
                                        commandType,
                                        actorUserId,
                                        clientMutationId,
                                        messageId,
                                        fingerprint);
                        } catch (RuntimeException resolutionFailure) {
                            Optional<ChatMessageStoreFailureKind>
                                    resolutionKind =
                                    exceptionClassifier.classify(
                                            resolutionFailure);
                            if (resolutionKind.isEmpty()
                                    || resolutionKind.get()
                                    == ChatMessageStoreFailureKind
                                    .PERMANENT) {
                                throw classifiedFailure(
                                        ChatMessageStoreFailureKind
                                                .OUTCOME_UNKNOWN,
                                        true,
                                        unknownCommitCause,
                                        "MongoDB unknown commit receipt "
                                                + "lookup failed",
                                        resolutionFailure);
                            }
                            if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                                preserveUnknownFollowUp(
                                        true,
                                        unknownCommitCause,
                                        resolutionFailure);
                                backoffBeforeRetry(
                                        attempt,
                                        true,
                                        unknownCommitCause);
                                continue;
                            }
                            throw classifiedFailure(
                                    ChatMessageStoreFailureKind
                                            .OUTCOME_UNKNOWN,
                                    true,
                                    unknownCommitCause,
                                    "MongoDB unknown commit receipt lookup "
                                            + "retry limit exceeded",
                                    resolutionFailure);
                        }
                        if (resolved != null) {
                            return record(resolved);
                        }
                        if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                            backoffBeforeRetry(
                                    attempt,
                                    true,
                                    unknownCommitCause);
                            continue;
                        }
                        throw classifiedFailure(
                                ChatMessageStoreFailureKind
                                        .OUTCOME_UNKNOWN,
                                true,
                                unknownCommitCause,
                                "MongoDB message mutation outcome could "
                                        + "not be determined",
                                exception);
                    }

                    if (kind == ChatMessageStoreFailureKind.TRANSIENT) {
                        if (attempt < MAX_TRANSACTION_ATTEMPTS) {
                            preserveUnknownFollowUp(
                                    unresolvedUnknownCommitSeen,
                                    unknownCommitCause,
                                    exception);
                            backoffBeforeRetry(
                                    attempt,
                                    unresolvedUnknownCommitSeen,
                                    unknownCommitCause);
                            continue;
                        }
                        throw classifiedFailure(
                                ChatMessageStoreFailureKind.TRANSIENT,
                                unresolvedUnknownCommitSeen,
                                unknownCommitCause,
                                "MongoDB message mutation retry limit "
                                        + "exceeded",
                                exception);
                    }

                    throw classifiedFailure(
                            ChatMessageStoreFailureKind.PERMANENT,
                            unresolvedUnknownCommitSeen,
                            unknownCommitCause,
                            "Permanent MongoDB message mutation failure",
                            exception);
                }
            }
            throw new IllegalStateException(
                    "Mutation retry loop exited unexpectedly");
        } catch (ChatMessageStoreException exception) {
            BestEffortMetricRecorder.increment(
                    "chat.message.mutation.persistence.failures",
                    failureCounter);
            throw exception;
        }
    }

    private ChatMessageMutationResult mutateInTransaction(
            MessageMutationCommandType commandType,
            String actorUserId,
            String clientMutationId,
            String roomId,
            String messageId,
            String fingerprint,
            String editedContent,
            Instant processedAt
    ) {
        MongoChatMessageMutationReceiptDocument existingReceipt =
                findReceipt(actorUserId, clientMutationId);
        if (existingReceipt != null) {
            return receiptResult(
                    existingReceipt,
                    commandType,
                    messageId,
                    fingerprint);
        }

        MongoChatMessageDocument document = mongoOperations.findOne(
                Query.query(new Criteria().andOperator(
                        Criteria.where("_id").is(messageId),
                        Criteria.where("roomId").is(roomId))),
                MongoChatMessageDocument.class,
                MongoChatMessageDocument.COLLECTION_NAME);
        if (document == null) {
            return insertReceipt(
                    commandType,
                    actorUserId,
                    clientMutationId,
                    roomId,
                    messageId,
                    fingerprint,
                    MessageMutationOutcome.MESSAGE_NOT_FOUND,
                    null,
                    processedAt);
        }
        ChatMessage current = document.toDomain();
        String creationContentFingerprint =
                document.effectiveCreationContentFingerprint();
        if (!actorUserId.equals(current.senderUserId())) {
            return insertReceipt(
                    commandType,
                    actorUserId,
                    clientMutationId,
                    roomId,
                    messageId,
                    fingerprint,
                    MessageMutationOutcome.MESSAGE_MUTATION_FORBIDDEN,
                    null,
                    processedAt);
        }
        if (commandType == MessageMutationCommandType.EDIT_MESSAGE) {
            return editMessage(
                    actorUserId,
                    clientMutationId,
                    roomId,
                    fingerprint,
                    editedContent,
                    processedAt,
                    current,
                    creationContentFingerprint);
        }
        return deleteMessage(
                actorUserId,
                clientMutationId,
                roomId,
                fingerprint,
                processedAt,
                current,
                creationContentFingerprint);
    }

    private ChatMessageMutationResult editMessage(
            String actorUserId,
            String clientMutationId,
            String roomId,
            String fingerprint,
            String editedContent,
            Instant processedAt,
            ChatMessage current,
            String creationContentFingerprint
    ) {
        if (current.state() != MessageState.ACTIVE) {
            return insertReceipt(
                    MessageMutationCommandType.EDIT_MESSAGE,
                    actorUserId,
                    clientMutationId,
                    roomId,
                    current.messageId(),
                    fingerprint,
                    MessageMutationOutcome.MESSAGE_DELETED,
                    current,
                    processedAt);
        }
        if (current.content().equals(editedContent)) {
            return insertReceipt(
                    MessageMutationCommandType.EDIT_MESSAGE,
                    actorUserId,
                    clientMutationId,
                    roomId,
                    current.messageId(),
                    fingerprint,
                    MessageMutationOutcome.UNCHANGED,
                    current,
                    processedAt);
        }
        ChatMessage updated = new ChatMessage(
                current.messageId(),
                current.roomId(),
                current.roomSequence(),
                current.senderUserId(),
                current.clientMessageId(),
                editedContent,
                MessageState.ACTIVE,
                current.countable(),
                current.messageVersion() + 1,
                current.createdAt(),
                processedAt,
                null);
        mongoOperations.save(
                MongoChatMessageDocument.fromDomain(
                        updated,
                        creationContentFingerprint),
                MongoChatMessageDocument.COLLECTION_NAME);
        summaryWriter.applyUpdated(updated);
        ChatMessageMutationResult result = insertReceipt(
                MessageMutationCommandType.EDIT_MESSAGE,
                actorUserId,
                clientMutationId,
                roomId,
                current.messageId(),
                fingerprint,
                MessageMutationOutcome.UPDATED,
                updated,
                processedAt);
        outboxWriter.appendMessageUpdated(updated);
        return result;
    }

    private ChatMessageMutationResult deleteMessage(
            String actorUserId,
            String clientMutationId,
            String roomId,
            String fingerprint,
            Instant processedAt,
            ChatMessage current,
            String creationContentFingerprint
    ) {
        if (current.state() == MessageState.DELETED_BY_AUTHOR) {
            return insertReceipt(
                    MessageMutationCommandType.DELETE_MESSAGE,
                    actorUserId,
                    clientMutationId,
                    roomId,
                    current.messageId(),
                    fingerprint,
                    MessageMutationOutcome.ALREADY_DELETED,
                    current,
                    processedAt);
        }
        ChatMessage deleted = new ChatMessage(
                current.messageId(),
                current.roomId(),
                current.roomSequence(),
                current.senderUserId(),
                current.clientMessageId(),
                null,
                MessageState.DELETED_BY_AUTHOR,
                current.countable(),
                current.messageVersion() + 1,
                current.createdAt(),
                processedAt,
                processedAt);
        mongoOperations.save(
                MongoChatMessageDocument.fromDomain(
                        deleted,
                        creationContentFingerprint),
                MongoChatMessageDocument.COLLECTION_NAME);
        summaryWriter.applyDeleted(deleted);
        ChatMessageMutationResult result = insertReceipt(
                MessageMutationCommandType.DELETE_MESSAGE,
                actorUserId,
                clientMutationId,
                roomId,
                current.messageId(),
                fingerprint,
                MessageMutationOutcome.DELETED,
                deleted,
                processedAt);
        outboxWriter.appendMessageDeleted(deleted);
        return result;
    }

    private ChatMessageMutationResult insertReceipt(
            MessageMutationCommandType commandType,
            String actorUserId,
            String clientMutationId,
            String roomId,
            String messageId,
            String fingerprint,
            MessageMutationOutcome outcome,
            ChatMessage message,
            Instant processedAt
    ) {
        MongoChatMessageMutationReceiptDocument receipt =
                new MongoChatMessageMutationReceiptDocument(
                        receiptId(actorUserId, clientMutationId),
                        MongoChatMessageMutationReceiptDocument
                                .CURRENT_SCHEMA_VERSION,
                        actorUserId,
                        clientMutationId,
                        commandType,
                        roomId,
                        messageId,
                        fingerprint,
                        outcome,
                        message == null ? null
                                : message.roomSequence(),
                        message == null ? null
                                : message.messageVersion(),
                        message == null ? null : message.state(),
                        processedAt);
        mongoOperations.insert(
                receipt,
                MongoChatMessageMutationReceiptDocument.COLLECTION_NAME);
        return receipt.toResult(false);
    }

    private ChatMessageMutationResult resolveReceipt(
            MessageMutationCommandType commandType,
            String actorUserId,
            String clientMutationId,
            String messageId,
            String fingerprint
    ) {
        MongoChatMessageMutationReceiptDocument receipt =
                findReceipt(actorUserId, clientMutationId);
        return receipt == null
                ? null
                : receiptResult(
                        receipt,
                        commandType,
                        messageId,
                        fingerprint);
    }

    private static ChatMessageMutationResult receiptResult(
            MongoChatMessageMutationReceiptDocument receipt,
            MessageMutationCommandType commandType,
            String messageId,
            String fingerprint
    ) {
        if (receipt.commandType() != commandType
                || !receipt.messageId().equals(messageId)
                || !receipt.requestFingerprint().equals(fingerprint)) {
            return new ChatMessageMutationResult(
                    commandType,
                    receipt.clientMutationId(),
                    MessageMutationOutcome.IDEMPOTENCY_CONFLICT,
                    messageId,
                    null,
                    null,
                    null,
                    false);
        }
        return receipt.toResult(true);
    }

    private MongoChatMessageMutationReceiptDocument findReceipt(
            String actorUserId,
            String clientMutationId
    ) {
        return mongoOperations.findOne(
                Query.query(new Criteria().andOperator(
                        Criteria.where("actorUserId").is(actorUserId),
                        Criteria.where("clientMutationId")
                                .is(clientMutationId))),
                MongoChatMessageMutationReceiptDocument.class,
                MongoChatMessageMutationReceiptDocument.COLLECTION_NAME);
    }

    private ChatMessageMutationResult record(
            ChatMessageMutationResult result
    ) {
        BestEffortMetricRecorder.increment(
                "chat.message.mutation.results",
                resultCounters.get(result.outcome()));
        if (result.replayed()) {
            BestEffortMetricRecorder.increment(
                    "chat.message.mutation.idempotency.replays",
                    replayCounter);
        }
        return result;
    }

    private static String receiptId(
            String actorUserId,
            String clientMutationId
    ) {
        return actorUserId + ":" + clientMutationId;
    }

    private static String fingerprint(
            MessageMutationCommandType commandType,
            String... values
    ) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            update(digest, commandType.name());
            for (String value : values) {
                update(digest, value);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 is not available", exception);
        }
    }

    private static void update(
            MessageDigest digest,
            String value
    ) {
        byte[] bytes = Objects.requireNonNull(value, "fingerprint value")
                .getBytes(StandardCharsets.UTF_8);
        digest.update((byte) (bytes.length >>> 24));
        digest.update((byte) (bytes.length >>> 16));
        digest.update((byte) (bytes.length >>> 8));
        digest.update((byte) bytes.length);
        digest.update(bytes);
    }

    private static ChatMessageStoreException classifiedFailure(
            ChatMessageStoreFailureKind classifiedKind,
            boolean unresolvedUnknownCommitSeen,
            Throwable unknownCommitCause,
            String message,
            Throwable currentCause
    ) {
        if (!unresolvedUnknownCommitSeen) {
            return new ChatMessageStoreException(
                    classifiedKind,
                    message,
                    currentCause);
        }

        ChatMessageStoreException outcomeUnknown =
                new ChatMessageStoreException(
                        ChatMessageStoreFailureKind.OUTCOME_UNKNOWN,
                        message,
                        unknownCommitCause);
        if (currentCause != null
                && currentCause != unknownCommitCause) {
            outcomeUnknown.addSuppressed(currentCause);
        }
        return outcomeUnknown;
    }

    private static void preserveUnknownFollowUp(
            boolean unresolvedUnknownCommitSeen,
            Throwable unknownCommitCause,
            Throwable followUpCause
    ) {
        if (unresolvedUnknownCommitSeen
                && unknownCommitCause != null
                && followUpCause != null
                && followUpCause != unknownCommitCause) {
            unknownCommitCause.addSuppressed(followUpCause);
        }
    }

    private static void backoffBeforeRetry(
            int attempt,
            boolean unresolvedUnknownCommitSeen,
            Throwable unknownCommitCause
    ) {
        try {
            Thread.sleep(10L * attempt);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw classifiedFailure(
                    ChatMessageStoreFailureKind.TRANSIENT,
                    unresolvedUnknownCommitSeen,
                    unknownCommitCause,
                    "Interrupted while retrying message mutation",
                    exception);
        }
    }
}
