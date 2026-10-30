package com.hamcheeze.chat.room.inbox.notification.mongo;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.inbox.notification.RoomInboxCurrentSummaryReadException;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.mongodb.MongoTimeoutException;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("local")
class MongoRoomInboxCurrentSummaryReaderTest
        extends MongoRuntimeIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-08-05T08:00:00Z");

    @Test
    void readsMissingActiveAndDeletedSummaryIdentity() {
        MongoRoomInboxCurrentSummaryReader reader =
                new MongoRoomInboxCurrentSummaryReader(mongoOperations);

        assertThat(reader.findCurrent("room-missing")).isEmpty();

        insert(summary("room-active", MessageState.ACTIVE, 2));
        assertThat(reader.findCurrent("room-active")).hasValueSatisfying(
                value -> {
                    assertThat(value.messageId())
                            .isEqualTo("message-room-active");
                    assertThat(value.roomSequence()).isEqualTo(10);
                    assertThat(value.messageVersion()).isEqualTo(2);
                    assertThat(value.state())
                            .isEqualTo(MessageState.ACTIVE);
                });

        insert(summary(
                "room-deleted", MessageState.DELETED_BY_AUTHOR, 3));
        assertThat(reader.findCurrent("room-deleted"))
                .hasValueSatisfying(value -> {
                    assertThat(value.messageVersion()).isEqualTo(3);
                    assertThat(value.state())
                            .isEqualTo(MessageState.DELETED_BY_AUTHOR);
                });
    }

    @Test
    void rejectsUnsupportedAndMalformedRawSummary() {
        Document unsupported = raw(summary(
                "room-unsupported", MessageState.ACTIVE, 2));
        unsupported.put("schemaVersion", 2);
        insert(unsupported);
        Document malformed = raw(summary(
                "room-malformed", MessageState.ACTIVE, 2));
        malformed.get("lastMessage", Document.class)
                .put("messageVersion", 2.0D);
        insert(malformed);
        MongoRoomInboxCurrentSummaryReader reader =
                new MongoRoomInboxCurrentSummaryReader(mongoOperations);

        assertFailure(reader, "room-unsupported", "unsupported-schema");
        assertFailure(reader, "room-malformed", "malformed-summary");
    }

    @Test
    void wrapsStorageAndRuntimeFailure() {
        for (RuntimeException failure : new RuntimeException[]{
                new MongoTimeoutException("timeout"),
                new IllegalStateException("runtime")}) {
            MongoOperations failing = mock(MongoOperations.class);
            when(failing.getCollection(
                    MongoRoomInboxSummaryDocument.COLLECTION_NAME))
                    .thenThrow(failure);

            assertFailure(
                    new MongoRoomInboxCurrentSummaryReader(failing),
                    "room-1",
                    "storage-or-runtime-failure");
        }
    }

    private void assertFailure(
            MongoRoomInboxCurrentSummaryReader reader,
            String roomId,
            String failureKind
    ) {
        assertThatThrownBy(() -> reader.findCurrent(roomId))
                .isInstanceOf(RoomInboxCurrentSummaryReadException.class)
                .extracting("failureKind")
                .isEqualTo(failureKind);
    }

    private void insert(RoomInboxSummary summary) {
        insert(raw(summary));
    }

    private void insert(Document raw) {
        mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .insertOne(raw);
    }

    private static RoomInboxSummary summary(
            String roomId,
            MessageState state,
            long version
    ) {
        RoomInboxLastMessage message = new RoomInboxLastMessage(
                "message-" + roomId,
                10,
                version,
                state,
                state == MessageState.ACTIVE ? "preview" : null,
                false,
                NOW);
        return new RoomInboxSummary(
                roomId, message, NOW, NOW.plusSeconds(1));
    }

    private static Document raw(RoomInboxSummary summary) {
        return MongoRoomInboxSummaryDocument
                .fromDomain(summary)
                .toBson();
    }
}
