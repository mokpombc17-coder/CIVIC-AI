package com.hamcheeze.chat.room.mongo;

import com.mongodb.MongoBulkWriteException;
import com.mongodb.MongoException;
import com.mongodb.MongoNodeIsRecoveringException;
import com.mongodb.MongoNotPrimaryException;
import com.mongodb.MongoSocketException;
import com.mongodb.MongoTimeoutException;
import com.mongodb.MongoWriteException;
import com.mongodb.bulk.BulkWriteError;
import org.bson.BsonDocument;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.TransientDataAccessException;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

public final class MongoRoomCommandExceptionClassifier {

    public static final String TRANSIENT_TRANSACTION_ERROR =
            "TransientTransactionError";
    public static final String UNKNOWN_TRANSACTION_COMMIT_RESULT =
            "UnknownTransactionCommitResult";

    public boolean isUnknownCommitResult(Throwable throwable) {
        return hasMongoLabel(
                throwable,
                UNKNOWN_TRANSACTION_COMMIT_RESULT);
    }

    public boolean isTransient(Throwable throwable) {
        if (hasMongoLabel(throwable, TRANSIENT_TRANSACTION_ERROR)) {
            return true;
        }
        for (Throwable cause : causes(throwable)) {
            if (cause instanceof TransientDataAccessException
                    || cause instanceof MongoSocketException
                    || cause instanceof MongoTimeoutException
                    || cause instanceof MongoNotPrimaryException
                    || cause instanceof MongoNodeIsRecoveringException) {
                return true;
            }
        }
        return false;
    }

    public boolean isMongoFailure(Throwable throwable) {
        for (Throwable cause : causes(throwable)) {
            if (cause instanceof MongoException
                    || cause instanceof DataAccessException) {
                return true;
            }
        }
        return false;
    }

    public Optional<DuplicateKeyKind> duplicateKeyKind(
            Throwable throwable
    ) {
        if (!isDuplicateKey(throwable)) {
            return Optional.empty();
        }
        for (Throwable cause : causes(throwable)) {
            if (cause instanceof MongoWriteException writeException) {
                DuplicateKeyKind kind = classifyDetails(
                        writeException.getError().getDetails(),
                        writeException.getError().getMessage());
                if (kind != DuplicateKeyKind.UNKNOWN) {
                    return Optional.of(kind);
                }
            }
            if (cause instanceof MongoBulkWriteException bulkException) {
                for (BulkWriteError error
                        : bulkException.getWriteErrors()) {
                    DuplicateKeyKind kind = classifyDetails(
                            error.getDetails(),
                            error.getMessage());
                    if (kind != DuplicateKeyKind.UNKNOWN) {
                        return Optional.of(kind);
                    }
                }
            }
        }
        return Optional.of(DuplicateKeyKind.UNKNOWN);
    }

    private boolean isDuplicateKey(Throwable throwable) {
        for (Throwable cause : causes(throwable)) {
            if (cause instanceof DuplicateKeyException) {
                return true;
            }
            if (cause instanceof MongoException mongoException
                    && (mongoException.getCode() == 11000
                    || mongoException.getCode() == 11001)) {
                return true;
            }
        }
        return false;
    }

    private DuplicateKeyKind classifyDetails(
            BsonDocument details,
            String message
    ) {
        BsonDocument keyPattern = details == null
                ? null
                : details.getDocument("keyPattern", null);
        if (hasKeys(
                keyPattern,
                "requesterUserId",
                "clientRequestId")) {
            return DuplicateKeyKind.RECEIPT_REQUEST;
        }
        if (hasKeys(keyPattern, "roomId", "userId")) {
            return DuplicateKeyKind.MEMBERSHIP_RELATION;
        }
        if (hasKeys(keyPattern, "roomId")) {
            return DuplicateKeyKind.MEMBERSHIP_OWNER;
        }
        if (hasKeys(keyPattern, "_id")) {
            if (message != null
                    && message.contains(
                    MongoRoomCommandReceiptDocument
                            .COLLECTION_NAME)) {
                return DuplicateKeyKind.RECEIPT_ID;
            }
            if (message != null
                    && message.contains(
                    MongoRoomDocument.COLLECTION_NAME)) {
                return DuplicateKeyKind.ROOM_ID;
            }
            if (message != null
                    && message.contains(
                    MongoMembershipDocument.COLLECTION_NAME)) {
                return DuplicateKeyKind.MEMBERSHIP_ID;
            }
            if (message != null
                    && message.contains(
                    MongoUserActiveRoomQuotaLockDocument
                            .COLLECTION_NAME)) {
                return DuplicateKeyKind.QUOTA_LOCK;
            }
            if (message != null
                    && message.contains("chat_room_sequences")) {
                return DuplicateKeyKind.ROOM_SEQUENCE;
            }
        }
        return DuplicateKeyKind.UNKNOWN;
    }

    private boolean hasMongoLabel(
            Throwable throwable,
            String label
    ) {
        for (Throwable cause : causes(throwable)) {
            if (cause instanceof MongoException mongoException
                    && mongoException.hasErrorLabel(label)) {
                return true;
            }
        }
        return false;
    }

    private boolean hasKeys(
            BsonDocument keyPattern,
            String... keys
    ) {
        if (keyPattern == null || keyPattern.size() != keys.length) {
            return false;
        }
        for (String key : keys) {
            if (!keyPattern.containsKey(key)) {
                return false;
            }
        }
        return true;
    }

    private Set<Throwable> causes(Throwable throwable) {
        Set<Throwable> causes = new HashSet<>();
        Throwable current = throwable;
        while (current != null && causes.add(current)) {
            current = current.getCause();
        }
        return causes;
    }

    public enum DuplicateKeyKind {
        RECEIPT_REQUEST,
        RECEIPT_ID,
        ROOM_ID,
        MEMBERSHIP_ID,
        MEMBERSHIP_RELATION,
        MEMBERSHIP_OWNER,
        QUOTA_LOCK,
        ROOM_SEQUENCE,
        UNKNOWN
    }
}
