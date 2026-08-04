package com.hamcheeze.chat.room.inbox;

import com.mongodb.MongoException;
import com.mongodb.MongoExecutionTimeoutException;
import com.mongodb.MongoNodeIsRecoveringException;
import com.mongodb.MongoNotPrimaryException;
import com.mongodb.MongoSocketException;
import com.mongodb.MongoTimeoutException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.dao.PermissionDeniedDataAccessException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.dao.RecoverableDataAccessException;
import org.springframework.dao.TransientDataAccessException;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Optional;
import java.util.Set;

final class RoomInboxStorageExceptionClassifier {

    Optional<FailureKind> classify(Throwable throwable) {
        Set<Throwable> visited = Collections.newSetFromMap(
                new IdentityHashMap<>());
        Throwable current = throwable;
        boolean storageFailure = false;
        boolean retryable = false;
        boolean explicitlyNonRetryable = false;
        while (current != null && visited.add(current)) {
            if (isExplicitlyNonRetryable(current)) {
                explicitlyNonRetryable = true;
                storageFailure = true;
            } else if (isRetryable(current)) {
                retryable = true;
                storageFailure = true;
            } else if (current instanceof DataAccessException
                    || current instanceof MongoException) {
                storageFailure = true;
            }
            current = current.getCause();
        }
        if (explicitlyNonRetryable) {
            return Optional.of(FailureKind.NON_RETRYABLE);
        }
        if (retryable) {
            return Optional.of(FailureKind.RETRYABLE);
        }
        return storageFailure
                ? Optional.of(FailureKind.NON_RETRYABLE)
                : Optional.empty();
    }

    private static boolean isRetryable(Throwable throwable) {
        if (throwable instanceof TransientDataAccessException
                || throwable instanceof RecoverableDataAccessException
                || throwable instanceof DataAccessResourceFailureException
                || throwable instanceof QueryTimeoutException
                || throwable instanceof MongoTimeoutException
                || throwable instanceof MongoExecutionTimeoutException
                || throwable instanceof MongoSocketException
                || throwable instanceof MongoNotPrimaryException
                || throwable instanceof MongoNodeIsRecoveringException) {
            return true;
        }
        return throwable instanceof MongoException mongoException
                && (mongoException.hasErrorLabel(MongoException
                .TRANSIENT_TRANSACTION_ERROR_LABEL)
                || mongoException.hasErrorLabel(MongoException
                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL));
    }

    private static boolean isExplicitlyNonRetryable(
            Throwable throwable
    ) {
        return throwable instanceof DuplicateKeyException
                || throwable instanceof DataIntegrityViolationException
                || throwable instanceof InvalidDataAccessApiUsageException
                || throwable instanceof PermissionDeniedDataAccessException;
    }

    enum FailureKind {
        RETRYABLE,
        NON_RETRYABLE
    }
}
