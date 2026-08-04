package com.hamcheeze.chat.room.inbox;

import com.mongodb.MongoCommandException;
import com.mongodb.MongoException;
import com.mongodb.MongoExecutionTimeoutException;
import com.mongodb.MongoSocketException;
import com.mongodb.MongoTimeoutException;
import com.mongodb.MongoWriteException;
import com.mongodb.ServerAddress;
import com.mongodb.WriteError;
import org.bson.BsonDocument;
import org.bson.BsonInt32;
import org.bson.BsonString;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.dao.PermissionDeniedDataAccessException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.dao.RecoverableDataAccessException;
import org.springframework.dao.TransientDataAccessException;

import static org.assertj.core.api.Assertions.assertThat;

class RoomInboxStorageExceptionClassifierTest {

    private final RoomInboxStorageExceptionClassifier classifier =
            new RoomInboxStorageExceptionClassifier();

    @Test
    void classifiesWhitelistedTransientFailuresAsRetryable() {
        assertRetryable(new TransientDataAccessException("transient") {
        });
        assertRetryable(new RecoverableDataAccessException("recoverable"));
        assertRetryable(new DataAccessResourceFailureException("resource"));
        assertRetryable(new QueryTimeoutException("query timeout"));
        assertRetryable(new MongoTimeoutException("mongo timeout"));
        assertRetryable(new MongoExecutionTimeoutException(
                50, "execution timeout"));
        assertRetryable(new MongoSocketException(
                "socket", new ServerAddress()));

        MongoException labelled = new MongoException("labelled");
        labelled.addLabel(MongoException
                .TRANSIENT_TRANSACTION_ERROR_LABEL);
        assertRetryable(labelled);
        assertRetryable(new RuntimeException(
                "wrapper", new MongoTimeoutException("nested")));
    }

    @Test
    void classifiesPermanentStorageFailuresAsNonRetryable() {
        assertNonRetryable(new DuplicateKeyException("duplicate"));
        assertNonRetryable(new DataIntegrityViolationException("integrity"));
        assertNonRetryable(new InvalidDataAccessApiUsageException("api"));
        assertNonRetryable(new PermissionDeniedDataAccessException(
                "permission", null));
        assertNonRetryable(new MongoException("generic"));
        assertNonRetryable(commandFailure(2, "BadValue"));
        assertNonRetryable(commandFailure(13, "Unauthorized"));
        assertNonRetryable(new MongoWriteException(
                new WriteError(
                        121, "document validation", new BsonDocument()),
                new ServerAddress()));
    }

    @Test
    void doesNotClassifyProgrammingErrorsAsStorageFailures() {
        assertThat(classifier.classify(
                new IllegalArgumentException("invalid"))).isEmpty();
        assertThat(classifier.classify(
                new IllegalStateException("invariant"))).isEmpty();
    }

    @Test
    void traversesCauseChainWithoutLoopingOnCycles() {
        assertThat(classifier.classify(new CyclicFailure())).isEmpty();
    }

    private void assertRetryable(Throwable throwable) {
        assertThat(classifier.classify(throwable))
                .contains(RoomInboxStorageExceptionClassifier
                        .FailureKind.RETRYABLE);
    }

    private void assertNonRetryable(Throwable throwable) {
        assertThat(classifier.classify(throwable))
                .contains(RoomInboxStorageExceptionClassifier
                        .FailureKind.NON_RETRYABLE);
    }

    private static MongoCommandException commandFailure(
            int code,
            String codeName
    ) {
        return new MongoCommandException(
                new BsonDocument("ok", new BsonInt32(0))
                        .append("code", new BsonInt32(code))
                        .append("codeName", new BsonString(codeName))
                        .append("errmsg", new BsonString("internal")),
                new ServerAddress());
    }

    private static final class CyclicFailure extends RuntimeException {

        @Override
        public synchronized Throwable getCause() {
            return this;
        }
    }
}
