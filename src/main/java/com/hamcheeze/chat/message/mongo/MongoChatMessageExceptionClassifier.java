package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import com.mongodb.ErrorCategory;
import com.mongodb.MongoBulkWriteException;
import com.mongodb.MongoExecutionTimeoutException;
import com.mongodb.MongoException;
import com.mongodb.MongoNodeIsRecoveringException;
import com.mongodb.MongoNotPrimaryException;
import com.mongodb.MongoServerUnavailableException;
import com.mongodb.MongoSocketException;
import com.mongodb.MongoTimeoutException;
import com.mongodb.MongoWriteException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.data.mapping.MappingException;
import org.bson.codecs.configuration.CodecConfigurationException;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

public final class MongoChatMessageExceptionClassifier {

    private static final Set<Integer> TRANSIENT_ERROR_CODES = Set.of(
            6,
            7,
            89,
            91,
            112,
            189,
            262,
            9001,
            10107,
            11600,
            11602,
            13435,
            13436);

    public Optional<ChatMessageStoreFailureKind> classify(
            Throwable throwable
    ) {
        for (Throwable cause : causes(throwable)) {
            if (cause instanceof MongoException mongoException) {
                if (mongoException.hasErrorLabel(
                        MongoException
                                .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL)) {
                    return Optional.of(
                            ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
                }
            }
        }
        for (Throwable cause : causes(throwable)) {
            if (cause instanceof MongoException mongoException) {
                if (mongoException.hasErrorLabel(
                        MongoException
                                .TRANSIENT_TRANSACTION_ERROR_LABEL)) {
                    return Optional.of(
                            ChatMessageStoreFailureKind.TRANSIENT);
                }
            }
        }

        for (Throwable cause : causes(throwable)) {
            if (cause instanceof MongoSocketException
                    || cause instanceof MongoTimeoutException
                    || cause instanceof MongoExecutionTimeoutException
                    || cause instanceof MongoServerUnavailableException
                    || cause instanceof MongoNotPrimaryException
                    || cause instanceof MongoNodeIsRecoveringException
                    || cause instanceof TransientDataAccessException) {
                return Optional.of(ChatMessageStoreFailureKind.TRANSIENT);
            }
            if (cause instanceof MongoException mongoException
                    && TRANSIENT_ERROR_CODES.contains(
                    mongoException.getCode())) {
                return Optional.of(ChatMessageStoreFailureKind.TRANSIENT);
            }
        }

        for (Throwable cause : causes(throwable)) {
            if (cause instanceof MappingException
                    || cause instanceof CodecConfigurationException) {
                return Optional.of(ChatMessageStoreFailureKind.PERMANENT);
            }
            if (cause instanceof MongoException
                    || cause instanceof DataAccessException) {
                return Optional.of(ChatMessageStoreFailureKind.PERMANENT);
            }
        }
        return Optional.empty();
    }

    public boolean isDuplicateKey(Throwable throwable) {
        for (Throwable cause : causes(throwable)) {
            if (cause instanceof DuplicateKeyException) {
                return true;
            }
            if (cause instanceof MongoException mongoException
                    && ErrorCategory.fromErrorCode(
                    mongoException.getCode())
                    == ErrorCategory.DUPLICATE_KEY) {
                return true;
            }
            if (cause instanceof MongoWriteException writeException
                    && writeException.getError()
                    .getCategory()
                    .equals(com.mongodb.ErrorCategory.DUPLICATE_KEY)) {
                return true;
            }
            if (cause instanceof MongoBulkWriteException bulkWriteException
                    && bulkWriteException.getWriteErrors().stream()
                    .anyMatch(error -> error.getCategory()
                            .equals(com.mongodb.ErrorCategory.DUPLICATE_KEY))) {
                return true;
            }
        }
        return false;
    }

    private Set<Throwable> causes(Throwable throwable) {
        Set<Throwable> causes = new HashSet<>();
        Throwable current = throwable;
        while (current != null && causes.add(current)) {
            current = current.getCause();
        }
        return causes;
    }
}
