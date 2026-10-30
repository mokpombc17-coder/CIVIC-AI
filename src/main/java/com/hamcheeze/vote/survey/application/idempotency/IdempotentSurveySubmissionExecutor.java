package com.hamcheeze.vote.survey.application.idempotency;

import com.hamcheeze.vote.survey.application.port.out.SurveyIdempotencyReceiptRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyReceiptId;
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
public final class IdempotentSurveySubmissionExecutor {

    private static final int MAX_TRANSACTION_ATTEMPTS = 3;

    private final TransactionOperations transactions;
    private final SurveyIdempotencyReceiptRepository receipts;
    private final Clock clock;

    @Autowired
    public IdempotentSurveySubmissionExecutor(
            PlatformTransactionManager transactionManager,
            SurveyIdempotencyReceiptRepository receipts
    ) {
        this(new TransactionTemplate(Objects.requireNonNull(
                        transactionManager, "transactionManager")),
                receipts,
                Clock.systemUTC());
    }

    IdempotentSurveySubmissionExecutor(
            TransactionOperations transactions,
            SurveyIdempotencyReceiptRepository receipts,
            Clock clock
    ) {
        this.transactions = Objects.requireNonNull(
                transactions, "transactions");
        this.receipts = Objects.requireNonNull(receipts, "receipts");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public <T> SurveyIdempotencyExecution<T> execute(
            SurveyIdempotencyCommand command,
            SurveyIdempotencyOutcomeCodec<T> outcomeCodec,
            SurveyTransactionalAction<T> action
    ) {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(outcomeCodec, "outcomeCodec");
        Objects.requireNonNull(action, "action");

        DataIntegrityViolationException lastConstraintFailure = null;
        for (int attempt = 1;
             attempt <= MAX_TRANSACTION_ATTEMPTS;
             attempt++) {
            try {
                SurveyIdempotencyExecution<T> execution =
                        transactions.execute(status -> executeInTransaction(
                                command, outcomeCodec, action));
                return Objects.requireNonNull(
                        execution, "transaction result");
            } catch (DataIntegrityViolationException exception) {
                lastConstraintFailure = exception;
                Optional<SurveyIdempotencyExecution<T>> resolved =
                        resolveAfterConstraintFailure(command, outcomeCodec);
                if (resolved.isPresent()) {
                    return resolved.get();
                }
            }
        }
        throw Objects.requireNonNull(lastConstraintFailure);
    }

    private <T> SurveyIdempotencyExecution<T> executeInTransaction(
            SurveyIdempotencyCommand command,
            SurveyIdempotencyOutcomeCodec<T> outcomeCodec,
            SurveyTransactionalAction<T> action
    ) {
        Optional<SurveyIdempotencyReceipt> existing =
                receipts.findByRequestForUpdate(
                        command.userId(),
                        command.operation(),
                        command.idempotencyKey());
        if (existing.isPresent()) {
            return resolveExisting(command, outcomeCodec, existing.get());
        }

        Instant createdAt = clock.instant();
        SurveyIdempotencyReceipt receipt =
                SurveyIdempotencyReceipt.processing(
                        new SurveyReceiptId(UUID.randomUUID()),
                        command,
                        createdAt,
                        null);
        receipts.insertProcessing(receipt);

        T result = Objects.requireNonNull(action.execute(), "result");
        StoredSurveyIdempotencyOutcome outcome =
                Objects.requireNonNull(
                        outcomeCodec.encode(result), "stored outcome");
        receipt.complete(outcome, notBefore(clock.instant(), createdAt));
        receipts.updateCompleted(receipt);
        return new SurveyIdempotencyExecution<>(result, false);
    }

    private <T> Optional<SurveyIdempotencyExecution<T>>
    resolveAfterConstraintFailure(
            SurveyIdempotencyCommand command,
            SurveyIdempotencyOutcomeCodec<T> outcomeCodec
    ) {
        SurveyIdempotencyExecution<T> resolved = transactions.execute(
                status -> receipts.findByRequest(
                                command.userId(),
                                command.operation(),
                                command.idempotencyKey())
                        .map(receipt -> resolveExisting(
                                command, outcomeCodec, receipt))
                        .orElse(null));
        return Optional.ofNullable(resolved);
    }

    private static <T> SurveyIdempotencyExecution<T> resolveExisting(
            SurveyIdempotencyCommand command,
            SurveyIdempotencyOutcomeCodec<T> outcomeCodec,
            SurveyIdempotencyReceipt receipt
    ) {
        if (!receipt.requestHash().equals(command.requestHash())) {
            throw SurveyIdempotencyException.conflict();
        }
        if (receipt.status()
                == SurveyIdempotencyReceiptStatus.PROCESSING) {
            throw new IllegalStateException(
                    "committed idempotency receipt is still processing");
        }
        T result = Objects.requireNonNull(
                outcomeCodec.decode(receipt.storedOutcome()),
                "decoded outcome");
        return new SurveyIdempotencyExecution<>(result, true);
    }

    private static Instant notBefore(Instant candidate, Instant minimum) {
        return candidate.isBefore(minimum) ? minimum : candidate;
    }
}
