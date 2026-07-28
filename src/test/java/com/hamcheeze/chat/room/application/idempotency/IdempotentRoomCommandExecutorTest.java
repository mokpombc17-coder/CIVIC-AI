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
import com.hamcheeze.chat.room.persistence.RoomCommandReceipt;
import com.hamcheeze.chat.room.persistence.RoomCommandReceiptStore;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import com.hamcheeze.chat.room.persistence.StoredRoomCommandResult;
import com.mongodb.MongoException;
import com.mongodb.MongoWriteException;
import com.mongodb.ServerAddress;
import com.mongodb.WriteError;
import org.bson.BsonDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class IdempotentRoomCommandExecutorTest {

    private static final String REQUEST_ID =
            "550e8400-e29b-41d4-a716-446655440000";
    private static final Instant COMPLETED_AT =
            Instant.parse("2026-07-28T01:00:00Z");

    private final RoomCommandResultCodec codec =
            new RoomCommandResultCodec(
                    JsonMapper.builder().build());
    private final FakeReceiptStore receipts =
            new FakeReceiptStore();
    private final RoomCommandProperties properties =
            new RoomCommandProperties();

    @BeforeEach
    void configureRetry() {
        properties.setMaxAttempts(3);
        properties.setRetryBackoff(Duration.ZERO);
    }

    @Test
    void matchingReceiptReplaysWithoutRunningAction() {
        PreparedRoomCommand command = prepared("fingerprint");
        RoomCommandResult storedResult = joined();
        receipts.receipt = receipt(command, storedResult);
        AtomicInteger actionCalls = new AtomicInteger();

        RoomCommandExecution execution = executor(
                TransactionOperations.withoutTransaction())
                .execute(command, () -> {
                    actionCalls.incrementAndGet();
                    return storedResult;
                });

        assertThat(execution.result()).isEqualTo(storedResult);
        assertThat(execution.replayed()).isTrue();
        assertThat(actionCalls).hasValue(0);
    }

    @Test
    void physicallyExistingExpiredReceiptStillReplays() {
        PreparedRoomCommand command = prepared("fingerprint");
        RoomCommandResult storedResult = joined();
        receipts.receipt = new RoomCommandReceipt(
                command.receiptId(),
                command.requesterUserId(),
                command.clientRequestId(),
                command.commandType(),
                command.fingerprint(),
                codec.encode(storedResult),
                Instant.parse("2020-01-01T00:00:00Z"),
                Instant.parse("2020-01-01T01:00:00Z"));

        RoomCommandExecution execution = executor(
                TransactionOperations.withoutTransaction())
                .execute(command, () -> {
                    throw new AssertionError("must not execute");
                });

        assertThat(execution.result()).isEqualTo(storedResult);
        assertThat(execution.replayed()).isTrue();
    }

    @Test
    void mismatchedFingerprintReturnsConflictWithoutMutation() {
        PreparedRoomCommand command = prepared("new-fingerprint");
        receipts.receipt = receipt(
                prepared("old-fingerprint"),
                joined());
        AtomicInteger actionCalls = new AtomicInteger();

        RoomCommandExecution execution = executor(
                TransactionOperations.withoutTransaction())
                .execute(command, () -> {
                    actionCalls.incrementAndGet();
                    return joined();
                });

        assertThat(execution.result().code())
                .isEqualTo(
                        RoomCommandResultCode.IDEMPOTENCY_CONFLICT);
        assertThat(execution.replayed()).isFalse();
        assertThat(actionCalls).hasValue(0);
        assertThat(receipts.insertCalls).isZero();
    }

    @Test
    void persistsBusinessNoOpAndDeterministicRejection() {
        RoomCommandExecution noOp = executor(
                TransactionOperations.withoutTransaction())
                .execute(
                        prepared("no-op"),
                        () -> result(
                                RoomCommandResultCode.ALREADY_ACTIVE));

        assertThat(noOp.result().code())
                .isEqualTo(RoomCommandResultCode.ALREADY_ACTIVE);
        assertThat(receipts.receipt).isNotNull();

        receipts.receipt = null;
        RoomCommandExecution rejection = executor(
                TransactionOperations.withoutTransaction())
                .execute(
                        prepared("rejection"),
                        () -> RoomCommandResult.rejection(
                                RoomCommandType.JOIN_ROOM,
                                RoomCommandResultCode.ROOM_CLOSED,
                                "room-1",
                                null));

        assertThat(rejection.result().code())
                .isEqualTo(RoomCommandResultCode.ROOM_CLOSED);
        assertThat(receipts.receipt).isNotNull();
    }

    @Test
    void internalFailureDoesNotInsertReceipt() {
        assertThatThrownBy(() -> executor(
                TransactionOperations.withoutTransaction())
                .execute(prepared("failure"), () -> {
                    throw new IllegalStateException("broken");
                }))
                .isInstanceOf(IllegalStateException.class);

        assertThat(receipts.receipt).isNull();
        assertThat(receipts.insertCalls).isZero();
    }

    @Test
    void optimisticConflictRetriesAndThenStoresResult() {
        AtomicInteger actionCalls = new AtomicInteger();

        RoomCommandExecution execution = executor(
                TransactionOperations.withoutTransaction())
                .execute(prepared("retry"), () -> {
                    if (actionCalls.incrementAndGet() == 1) {
                        throw new RoomOptimisticConflictException(
                                "stale");
                    }
                    return joined();
                });

        assertThat(execution.result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        assertThat(actionCalls).hasValue(2);
        assertThat(receipts.insertCalls).isEqualTo(1);
    }

    @Test
    void duplicateReceiptRaceRecoversStoredWinner() {
        receipts.throwDuplicateAfterInsert = true;
        AtomicInteger actionCalls = new AtomicInteger();

        RoomCommandExecution execution = executor(
                TransactionOperations.withoutTransaction())
                .execute(prepared("duplicate"), () -> {
                    actionCalls.incrementAndGet();
                    return joined();
                });

        assertThat(execution.result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        assertThat(execution.replayed()).isTrue();
        assertThat(actionCalls).hasValue(1);
    }

    @Test
    void unknownCommitUsesReceiptWithoutExecutingAgain() {
        AtomicInteger transactionCalls = new AtomicInteger();
        AtomicInteger actionCalls = new AtomicInteger();
        TransactionOperations operations = new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> callback) {
                T value = callback.doInTransaction(null);
                if (transactionCalls.incrementAndGet() == 1) {
                    MongoException unknown =
                            new MongoException("unknown commit");
                    unknown.addLabel(
                            MongoRoomCommandExceptionClassifier
                                    .UNKNOWN_TRANSACTION_COMMIT_RESULT);
                    throw unknown;
                }
                return value;
            }
        };

        RoomCommandExecution execution = executor(operations)
                .execute(prepared("unknown"), () -> {
                    actionCalls.incrementAndGet();
                    return joined();
                });

        assertThat(execution.result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        assertThat(execution.replayed()).isTrue();
        assertThat(actionCalls).hasValue(1);
        assertThat(transactionCalls).hasValue(1);
    }

    @Test
    void transientTransactionFailureRetriesThenSucceeds() {
        AtomicInteger transactionCalls = new AtomicInteger();
        TransactionOperations operations = new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> callback) {
                if (transactionCalls.incrementAndGet() == 1) {
                    MongoException transientFailure =
                            new MongoException("transient");
                    transientFailure.addLabel(
                            MongoRoomCommandExceptionClassifier
                                    .TRANSIENT_TRANSACTION_ERROR);
                    throw transientFailure;
                }
                return callback.doInTransaction(null);
            }
        };

        RoomCommandExecution execution = executor(operations)
                .execute(prepared("transient"), this::joined);

        assertThat(execution.result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        assertThat(transactionCalls).hasValue(2);
    }

    @Test
    void unresolvedUnknownCommitIsNotGuessedAsSuccess() {
        properties.setMaxAttempts(2);
        TransactionOperations operations = new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> callback) {
                MongoException unknown =
                        new MongoException("unknown commit");
                unknown.addLabel(
                        MongoRoomCommandExceptionClassifier
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT);
                throw unknown;
            }
        };

        assertThatThrownBy(() -> executor(operations)
                .execute(prepared("unknown"), this::joined))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> {
                            assertThat(exception.kind())
                                    .isEqualTo(
                                            RoomCommandFailureKind
                                                    .OUTCOME_UNKNOWN);
                            assertThat(exception.retryable()).isTrue();
                        });
        assertThat(receipts.receipt).isNull();
    }

    @Test
    void unknownCommitThenRoomIdDuplicateRecoversReceipt() {
        PreparedRoomCommand command = prepared("unknown-duplicate");
        RoomCommandResult storedResult = joined();
        receipts.hiddenFinds = 3;
        AtomicInteger transactionCalls = new AtomicInteger();
        AtomicInteger actionCalls = new AtomicInteger();
        TransactionOperations operations = new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> callback) {
                int transactionCall =
                        transactionCalls.incrementAndGet();
                T value = callback.doInTransaction(null);
                if (transactionCall == 1) {
                    MongoException unknown =
                            new MongoException("unknown commit");
                    unknown.addLabel(
                            MongoRoomCommandExceptionClassifier
                                    .UNKNOWN_TRANSACTION_COMMIT_RESULT);
                    throw unknown;
                }
                return value;
            }
        };

        RoomCommandExecution execution = executor(operations)
                .execute(command, () -> {
                    if (actionCalls.incrementAndGet() == 1) {
                        return storedResult;
                    }
                    throw duplicateId("chat_rooms");
                });

        assertThat(execution.result()).isEqualTo(storedResult);
        assertThat(execution.replayed()).isTrue();
        assertThat(actionCalls).hasValue(2);
        assertThat(transactionCalls).hasValue(2);
        assertThat(receipts.findCalls).isEqualTo(4);
    }

    @Test
    void unknownCommitThenGeneratedIdDuplicateExhaustionIsUnknown() {
        properties.setMaxAttempts(2);
        AtomicInteger transactionCalls = new AtomicInteger();
        TransactionOperations operations = new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> callback) {
                if (transactionCalls.incrementAndGet() == 1) {
                    MongoException unknown =
                            new MongoException("unknown commit");
                    unknown.addLabel(
                            MongoRoomCommandExceptionClassifier
                                    .UNKNOWN_TRANSACTION_COMMIT_RESULT);
                    throw unknown;
                }
                return callback.doInTransaction(null);
            }
        };

        assertThatThrownBy(() -> executor(operations)
                .execute(
                        prepared("unknown-id-collision"),
                        () -> {
                            throw duplicateId("chat_memberships");
                        }))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> {
                            assertThat(exception.kind())
                                    .isEqualTo(
                                            RoomCommandFailureKind
                                                    .OUTCOME_UNKNOWN);
                            assertThat(exception.retryable()).isTrue();
                        });
    }

    @Test
    void generatedIdDuplicateWithoutUnknownCommitIsPermanent() {
        assertPermanentGeneratedIdCollision(
                "chat_rooms",
                "room-id-collision");
    }

    @Test
    void receiptIdDuplicateWithoutUnknownCommitIsPermanent() {
        assertPermanentGeneratedIdCollision(
                "chat_room_command_receipts",
                "receipt-id-collision");
    }

    @Test
    void retryExhaustionIsReportedWithoutReceipt() {
        properties.setMaxAttempts(2);

        assertThatThrownBy(() -> executor(
                TransactionOperations.withoutTransaction())
                .execute(prepared("exhausted"), () -> {
                    throw new RoomOptimisticConflictException(
                            "stale");
                }))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> assertThat(exception.kind())
                                .isEqualTo(
                                        RoomCommandFailureKind
                                                .CONCURRENCY_RETRY_EXHAUSTED));
        assertThat(receipts.receipt).isNull();
    }

    private IdempotentRoomCommandExecutor executor(
            TransactionOperations operations
    ) {
        return new IdempotentRoomCommandExecutor(
                operations,
                receipts,
                codec,
                new MongoRoomCommandExceptionClassifier(),
                properties);
    }

    private void assertPermanentGeneratedIdCollision(
            String collection,
            String fingerprint
    ) {
        assertThatThrownBy(() -> executor(
                TransactionOperations.withoutTransaction())
                .execute(prepared(fingerprint), () -> {
                    throw duplicateId(collection);
                }))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> {
                            assertThat(exception.kind())
                                    .isEqualTo(
                                            RoomCommandFailureKind
                                                    .PERMANENT);
                            assertThat(exception.retryable()).isFalse();
                        });
    }

    private MongoWriteException duplicateId(String collection) {
        return new MongoWriteException(
                new WriteError(
                        11000,
                        collection,
                        BsonDocument.parse(
                                "{keyPattern:{_id:1}}")),
                new ServerAddress());
    }

    private PreparedRoomCommand prepared(String fingerprint) {
        return new PreparedRoomCommand(
                "user-1",
                REQUEST_ID,
                RoomCommandType.JOIN_ROOM,
                fingerprint,
                "receipt-1",
                COMPLETED_AT,
                COMPLETED_AT.plusSeconds(3600),
                "room-1",
                null);
    }

    private RoomCommandReceipt receipt(
            PreparedRoomCommand command,
            RoomCommandResult result
    ) {
        return new RoomCommandReceipt(
                command.receiptId(),
                command.requesterUserId(),
                command.clientRequestId(),
                command.commandType(),
                command.fingerprint(),
                codec.encode(result),
                command.completedAt(),
                command.expiresAt());
    }

    private RoomCommandResult joined() {
        return result(RoomCommandResultCode.JOINED);
    }

    private RoomCommandResult result(RoomCommandResultCode code) {
        return new RoomCommandResult(
                RoomCommandType.JOIN_ROOM,
                code,
                "room-1",
                "membership-1",
                "user-1",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                1L,
                0L,
                null,
                null,
                null);
    }

    private final class FakeReceiptStore
            implements RoomCommandReceiptStore {

        private RoomCommandReceipt receipt;
        private int insertCalls;
        private int findCalls;
        private int hiddenFinds;
        private boolean throwDuplicateAfterInsert;

        @Override
        public Optional<RoomCommandReceipt> findByRequest(
                String requesterUserId,
                String clientRequestId
        ) {
            findCalls++;
            if (findCalls <= hiddenFinds) {
                return Optional.empty();
            }
            return Optional.ofNullable(receipt);
        }

        @Override
        public void insert(RoomCommandReceipt newReceipt) {
            insertCalls++;
            receipt = newReceipt;
            if (throwDuplicateAfterInsert) {
                throwDuplicateAfterInsert = false;
                throw new DuplicateKeyException("receipt duplicate");
            }
        }
    }
}
