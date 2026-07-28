package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.mongo.MongoRoomCommandExceptionClassifier.DuplicateKeyKind;
import com.mongodb.MongoException;
import com.mongodb.MongoWriteException;
import com.mongodb.ServerAddress;
import com.mongodb.WriteError;
import org.bson.BsonDocument;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

import static org.assertj.core.api.Assertions.assertThat;

class MongoRoomCommandExceptionClassifierTest {

    private final MongoRoomCommandExceptionClassifier classifier =
            new MongoRoomCommandExceptionClassifier();

    @Test
    void recognizesTransactionLabels() {
        MongoException transientFailure = new MongoException("transient");
        transientFailure.addLabel(
                MongoRoomCommandExceptionClassifier
                        .TRANSIENT_TRANSACTION_ERROR);
        MongoException unknownCommit = new MongoException("unknown");
        unknownCommit.addLabel(
                MongoRoomCommandExceptionClassifier
                        .UNKNOWN_TRANSACTION_COMMIT_RESULT);

        assertThat(classifier.isTransient(transientFailure)).isTrue();
        assertThat(classifier.isUnknownCommitResult(unknownCommit))
                .isTrue();
    }

    @Test
    void classifiesStructuredDuplicateKeyPatterns() {
        assertThat(classifier.duplicateKeyKind(duplicate(
                "{requesterUserId:1,clientRequestId:1}",
                "receipt")))
                .contains(DuplicateKeyKind.RECEIPT_REQUEST);
        assertThat(classifier.duplicateKeyKind(duplicate(
                "{roomId:1,userId:1}",
                "membership relation")))
                .contains(DuplicateKeyKind.MEMBERSHIP_RELATION);
        assertThat(classifier.duplicateKeyKind(duplicate(
                "{roomId:1}",
                "owner")))
                .contains(DuplicateKeyKind.MEMBERSHIP_OWNER);
        assertThat(classifier.duplicateKeyKind(duplicate(
                "{_id:1}",
                "chat_rooms")))
                .contains(DuplicateKeyKind.ROOM_ID);
        assertThat(classifier.duplicateKeyKind(duplicate(
                "{_id:1}",
                "chat_memberships")))
                .contains(DuplicateKeyKind.MEMBERSHIP_ID);
    }

    @Test
    void classifiesUnstructuredSpringDuplicateAsUnknown() {
        assertThat(classifier.duplicateKeyKind(
                new DuplicateKeyException("duplicate")))
                .contains(DuplicateKeyKind.UNKNOWN);
    }

    private MongoWriteException duplicate(
            String keyPattern,
            String message
    ) {
        return new MongoWriteException(
                new WriteError(
                        11000,
                        message,
                        BsonDocument.parse(
                                "{keyPattern:" + keyPattern + "}")),
                new ServerAddress());
    }
}
