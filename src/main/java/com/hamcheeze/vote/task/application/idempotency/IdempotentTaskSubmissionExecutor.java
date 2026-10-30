package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.application.port.out.TaskSubmissionReceiptRepository;
import com.hamcheeze.vote.task.domain.common.TaskReceiptId;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Component
public final class IdempotentTaskSubmissionExecutor {

    private static final int MAX_TRANSACTION_ATTEMPTS = 3;

    private final TransactionOperations transactions;
    private final TaskSubmissionReceiptRepository receipts;
    private final Clock clock;

    @Autowired
    public IdempotentTaskSubmissionExecutor(
            PlatformTransactionManager transactionManager,
            TaskSubmissionReceiptRepository receipts
    ) {
        this(new TransactionTemplate(Objects.requireNonNull(
                        transactionManager, "transactionManager")),
                receipts,
                Clock.systemUTC());
    }

    IdempotentTaskSubmissionExecutor(
            TransactionOperations transactions,
            TaskSubmissionReceiptRepository receipts,
            Clock clock
    ) {
        this.transactions = Objects.requireNonNull(
                transactions, "transactions");
        this.receipts = Objects.requireNonNull(receipts, "receipts");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public <T> TaskIdempotencyExecution<T> execute(
            TaskIdempotencyCommand command,
            TaskIdempotencyOutcomeCodec<T> outcomeCodec,
            TaskTransactionalAction<T> action
    ) {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(outcomeCodec, "outcomeCodec");
        Objects.requireNonNull(action, "action");

        DataIntegrityViolationException lastConstraintFailure = null;
        for (int attempt = 1;
             attempt <= MAX_TRANSACTION_ATTEMPTS;
             attempt++) {
            try {
                TaskIdempotencyExecution<T> execution =
                        transactions.execute(status -> executeInTransaction(
                                command, outcomeCodec, action));
                return Objects.requireNonNull(
                        execution, "transaction result");
            } catch (DataIntegrityViolationException exception) {
                lastConstraintFailure = exception;
                Optional<TaskIdempotencyExecution<T>> resolved =
                        resolveAfterConstraintFailure(command, outcomeCodec);
                if (resolved.isPresent()) {
                    return resolved.get();
                }
            }
        }
        throw Objects.requireNonNull(lastConstraintFailure);
    }

    private <T> TaskIdempotencyExecution<T> executeInTransaction(
            TaskIdempotencyCommand command,
            TaskIdempotencyOutcomeCodec<T> outcomeCodec,
            TaskTransactionalAction<T> action
    ) {
        Optional<TaskSubmissionReceipt> existing =
                receipts.findByRequestForUpdate(
                        command.userId(), command.idempotencyKey());
        if (existing.isPresent()) {
            return resolveExisting(command, outcomeCodec, existing.get());
        }

        Instant createdAt = clock.instant();
        TaskSubmissionReceipt receipt = TaskSubmissionReceipt.processing(
                new TaskReceiptId(UUID.randomUUID()),
                command.userId(),
                command.idempotencyKey(),
                command.requestHash(),
                command.outcomeSchemaVersion(),
                createdAt,
                null);
        receipts.insertProcessing(receipt);

        T result = Objects.requireNonNull(action.execute(), "result");
        StoredTaskSubmissionOutcome outcome = Objects.requireNonNull(
                outcomeCodec.encode(result), "stored outcome");
        receipt.complete(outcome, notBefore(clock.instant(), createdAt));
        receipts.updateCompleted(receipt);
        return new TaskIdempotencyExecution<>(result, false);
    }

    private <T> Optional<TaskIdempotencyExecution<T>>
    resolveAfterConstraintFailure(
            TaskIdempotencyCommand command,
            TaskIdempotencyOutcomeCodec<T> outcomeCodec
    ) {
        TaskIdempotencyExecution<T> resolved = transactions.execute(
                status -> receipts.findByRequest(
                                command.userId(),
                                command.idempotencyKey())
                        .map(receipt -> resolveExisting(
                                command, outcomeCodec, receipt))
                        .orElse(null));
        return Optional.ofNullable(resolved);
    }

    private static <T> TaskIdempotencyExecution<T> resolveExisting(
            TaskIdempotencyCommand command,
            TaskIdempotencyOutcomeCodec<T> outcomeCodec,
            TaskSubmissionReceipt receipt
    ) {
        if (!receipt.requestHash().equals(command.requestHash())) {
            throw TaskIdempotencyException.conflict();
        }
        if (receipt.status() == TaskSubmissionReceiptStatus.PROCESSING) {
            throw new IllegalStateException(
                    "committed idempotency receipt is still processing");
        }
        T result = Objects.requireNonNull(
                outcomeCodec.decode(receipt.storedOutcome()),
                "decoded outcome");
        return new TaskIdempotencyExecution<>(result, true);
    }

    private static Instant notBefore(Instant candidate, Instant minimum) {
        return candidate.isBefore(minimum) ? minimum : candidate;
    }
}
