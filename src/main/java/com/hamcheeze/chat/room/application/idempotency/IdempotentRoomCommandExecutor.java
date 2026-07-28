package com.hamcheeze.chat.room.application.idempotency;

import com.hamcheeze.chat.room.application.RoomCommandProperties;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCodec;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.application.transaction.RoomOptimisticConflictException;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandExceptionClassifier;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandExceptionClassifier.DuplicateKeyKind;
import com.hamcheeze.chat.room.persistence.RoomCommandReceipt;
import com.hamcheeze.chat.room.persistence.RoomCommandReceiptStore;
import com.hamcheeze.chat.room.persistence.StoredRoomCommandResult;
import org.springframework.transaction.support.TransactionOperations;

import java.util.Objects;
import java.util.Optional;

public final class IdempotentRoomCommandExecutor {

    private final TransactionOperations transactionOperations;
    private final RoomCommandReceiptStore receiptStore;
    private final RoomCommandResultCodec resultCodec;
    private final MongoRoomCommandExceptionClassifier exceptionClassifier;
    private final RoomCommandProperties properties;

    public IdempotentRoomCommandExecutor(
            TransactionOperations transactionOperations,
            RoomCommandReceiptStore receiptStore,
            RoomCommandResultCodec resultCodec,
            MongoRoomCommandExceptionClassifier exceptionClassifier,
            RoomCommandProperties properties
    ) {
        this.transactionOperations = Objects.requireNonNull(
                transactionOperations,
                "transactionOperations");
        this.receiptStore =
                Objects.requireNonNull(receiptStore, "receiptStore");
        this.resultCodec =
                Objects.requireNonNull(resultCodec, "resultCodec");
        this.exceptionClassifier = Objects.requireNonNull(
                exceptionClassifier,
                "exceptionClassifier");
        this.properties =
                Objects.requireNonNull(properties, "properties");
    }

    public RoomCommandExecution execute(
            PreparedRoomCommand command,
            RoomTransactionalAction action
    ) {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(action, "action");

        boolean unresolvedUnknownCommit = false;
        Throwable unknownCommitCause = null;
        RetryReason lastRetryReason = RetryReason.TRANSIENT;
        Throwable lastRetryCause = null;

        for (int attempt = 1;
                attempt <= properties.maxAttempts();
                attempt++) {
            try {
                RoomCommandExecution execution =
                        transactionOperations.execute(status ->
                                executeInTransaction(command, action));
                return Objects.requireNonNull(
                        execution,
                        "transaction result");
            } catch (RoomCommandExecutionException exception) {
                throw exception;
            } catch (RuntimeException exception) {
                if (exceptionClassifier
                        .isUnknownCommitResult(exception)) {
                    unresolvedUnknownCommit = true;
                    unknownCommitCause = exception;
                    Optional<RoomCommandExecution> recovered =
                            resolveAfterFailure(command);
                    if (recovered.isPresent()) {
                        return recovered.get();
                    }
                    lastRetryReason = RetryReason.UNKNOWN_COMMIT;
                    lastRetryCause = exception;
                } else if (exception
                        instanceof RoomOptimisticConflictException) {
                    lastRetryReason = RetryReason.CONCURRENCY;
                    lastRetryCause = exception;
                } else {
                    Optional<DuplicateKeyKind> duplicateKind =
                            exceptionClassifier.duplicateKeyKind(
                                    exception);
                    if (duplicateKind.isPresent()) {
                        DuplicateKeyKind kind = duplicateKind.get();
                        if (kind == DuplicateKeyKind.RECEIPT_REQUEST
                                || kind == DuplicateKeyKind.UNKNOWN) {
                            Optional<RoomCommandExecution> recovered =
                                    resolveAfterFailure(command);
                            if (recovered.isPresent()) {
                                return recovered.get();
                            }
                        }
                        if (kind == DuplicateKeyKind.ROOM_ID
                                || kind
                                == DuplicateKeyKind.MEMBERSHIP_ID) {
                            throw failure(
                                    RoomCommandFailureKind.PERMANENT,
                                    "Generated room command ID collision",
                                    exception);
                        }
                        lastRetryReason = RetryReason.CONCURRENCY;
                        lastRetryCause = exception;
                    } else if (exceptionClassifier
                            .isTransient(exception)) {
                        lastRetryReason = RetryReason.TRANSIENT;
                        lastRetryCause = exception;
                    } else if (exceptionClassifier
                            .isMongoFailure(exception)) {
                        if (unresolvedUnknownCommit) {
                            throw failure(
                                    RoomCommandFailureKind.OUTCOME_UNKNOWN,
                                    "Room command commit outcome is unknown",
                                    unknownCommitCause);
                        }
                        throw failure(
                                RoomCommandFailureKind.PERMANENT,
                                "Permanent MongoDB room command failure",
                                exception);
                    } else {
                        throw exception;
                    }
                }
            }

            if (attempt < properties.maxAttempts()) {
                backoff();
            }
        }

        if (unresolvedUnknownCommit) {
            throw failure(
                    RoomCommandFailureKind.OUTCOME_UNKNOWN,
                    "Room command commit outcome is unknown",
                    unknownCommitCause);
        }
        RoomCommandFailureKind kind =
                lastRetryReason == RetryReason.TRANSIENT
                        ? RoomCommandFailureKind.TRANSIENT
                        : RoomCommandFailureKind
                        .CONCURRENCY_RETRY_EXHAUSTED;
        throw failure(
                kind,
                "Room command retry attempts exhausted",
                lastRetryCause);
    }

    private RoomCommandExecution executeInTransaction(
            PreparedRoomCommand command,
            RoomTransactionalAction action
    ) {
        Optional<RoomCommandReceipt> existing =
                receiptStore.findByRequest(
                        command.requesterUserId(),
                        command.clientRequestId());
        if (existing.isPresent()) {
            return resolveExisting(command, existing.get());
        }

        RoomCommandResult result =
                Objects.requireNonNull(action.execute(), "result");
        StoredRoomCommandResult stored = resultCodec.encode(result);
        receiptStore.insert(new RoomCommandReceipt(
                command.receiptId(),
                command.requesterUserId(),
                command.clientRequestId(),
                command.commandType(),
                command.fingerprint(),
                stored,
                command.completedAt(),
                command.expiresAt()));
        return new RoomCommandExecution(
                command.clientRequestId(),
                result,
                false);
    }

    private Optional<RoomCommandExecution> resolveAfterFailure(
            PreparedRoomCommand command
    ) {
        try {
            return receiptStore.findByRequest(
                            command.requesterUserId(),
                            command.clientRequestId())
                    .map(receipt -> resolveExisting(command, receipt));
        } catch (RoomCommandExecutionException exception) {
            throw exception;
        } catch (RuntimeException resolutionFailure) {
            if (!exceptionClassifier
                    .isMongoFailure(resolutionFailure)) {
                throw resolutionFailure;
            }
            return Optional.empty();
        }
    }

    private RoomCommandExecution resolveExisting(
            PreparedRoomCommand command,
            RoomCommandReceipt receipt
    ) {
        if (receipt.commandType() != command.commandType()
                || !receipt.requestFingerprint()
                .equals(command.fingerprint())) {
            return new RoomCommandExecution(
                    command.clientRequestId(),
                    RoomCommandResult.rejection(
                            command.commandType(),
                            RoomCommandResultCode.IDEMPOTENCY_CONFLICT,
                            command.roomId(),
                            command.targetUserId()),
                    false);
        }
        RoomCommandResult result = resultCodec.decode(
                receipt.result(),
                receipt.commandType());
        return new RoomCommandExecution(
                command.clientRequestId(),
                result,
                true);
    }

    private void backoff() {
        if (properties.retryBackoff().isZero()) {
            return;
        }
        try {
            Thread.sleep(properties.retryBackoff());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure(
                    RoomCommandFailureKind.TRANSIENT,
                    "Interrupted while retrying room command",
                    exception);
        }
    }

    private static RoomCommandExecutionException failure(
            RoomCommandFailureKind kind,
            String message,
            Throwable cause
    ) {
        return new RoomCommandExecutionException(
                kind,
                message,
                cause);
    }

    private enum RetryReason {
        TRANSIENT,
        CONCURRENCY,
        UNKNOWN_COMMIT
    }
}
