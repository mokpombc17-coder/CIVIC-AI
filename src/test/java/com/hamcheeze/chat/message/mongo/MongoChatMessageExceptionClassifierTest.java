package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import com.mongodb.MongoException;
import com.mongodb.MongoServerUnavailableException;
import org.bson.codecs.configuration.CodecConfigurationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mapping.MappingException;

import static org.assertj.core.api.Assertions.assertThat;

class MongoChatMessageExceptionClassifierTest {

    private final MongoChatMessageExceptionClassifier classifier =
            new MongoChatMessageExceptionClassifier();

    @Test
    void transientTransactionLabelIsTransient() {
        MongoException exception = new MongoException("transient");
        exception.addLabel(
                MongoException.TRANSIENT_TRANSACTION_ERROR_LABEL);

        assertThat(classifier.classify(exception))
                .contains(ChatMessageStoreFailureKind.TRANSIENT);
    }

    @Test
    void unknownCommitLabelIsOutcomeUnknown() {
        MongoException exception = new MongoException("unknown");
        exception.addLabel(
                MongoException
                        .UNKNOWN_TRANSACTION_COMMIT_RESULT_LABEL);

        assertThat(classifier.classify(exception))
                .contains(
                        ChatMessageStoreFailureKind.OUTCOME_UNKNOWN);
    }

    @Test
    void writeConflictCodeIsTransient() {
        assertThat(classifier.classify(
                new MongoException(112, "write conflict")))
                .contains(ChatMessageStoreFailureKind.TRANSIENT);
    }

    @Test
    void unavailableServerIsTransient() {
        assertThat(classifier.classify(
                new MongoServerUnavailableException(
                        "server unavailable")))
                .contains(ChatMessageStoreFailureKind.TRANSIENT);
    }

    @Test
    void mappingAndCodecFailuresArePermanent() {
        assertThat(classifier.classify(
                new MappingException("mapping failed")))
                .contains(ChatMessageStoreFailureKind.PERMANENT);
        assertThat(classifier.classify(
                new CodecConfigurationException("codec failed")))
                .contains(ChatMessageStoreFailureKind.PERMANENT);
    }

    @Test
    void genericMongoFailureIsPermanent() {
        assertThat(classifier.classify(
                new MongoException(13, "not authorized")))
                .contains(ChatMessageStoreFailureKind.PERMANENT);
    }

    @Test
    void programmingErrorIsNotClassifiedAsMongoFailure() {
        assertThat(classifier.classify(
                new IllegalStateException("programming error")))
                .isEmpty();
    }

    @Test
    void duplicateKeyUsesStructuredTypeOrErrorCode() {
        assertThat(classifier.isDuplicateKey(
                new DuplicateKeyException("duplicate"))).isTrue();
        assertThat(classifier.isDuplicateKey(
                new MongoException(11000, "duplicate"))).isTrue();
    }
}
