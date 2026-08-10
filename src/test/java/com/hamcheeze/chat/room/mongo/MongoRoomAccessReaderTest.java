package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.authorization.RoomAccessReadException;
import com.hamcheeze.chat.room.authorization.RoomAccessState;
import com.hamcheeze.chat.room.authorization.RoomAuthorizationProperties;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MongoRoomAccessReaderTest {

    private final MongoOperations mongo = mock(MongoOperations.class);
    private final RoomAuthorizationProperties properties =
            new RoomAuthorizationProperties();
    private final MongoRoomAccessReader reader =
            new MongoRoomAccessReader(mongo, properties);

    @Test
    void returnsStableActiveMembershipSnapshot() {
        whenRoom(room("ACTIVE", 3), room("ACTIVE", 3));
        whenMembership(membership("ACTIVE", 2));

        var snapshot = reader.readAccess("user-1", "room-1");
        assertThat(snapshot.state())
                .isEqualTo(RoomAccessState.ACTIVE_MEMBER);
        assertThat(snapshot.membershipId())
                .isEqualTo("membership-1");
        assertThat(snapshot.messageVisibleAfterSequence())
                .isEqualTo(100);
    }

    @Test
    void acceptsPreviousRoomSchemaVersion() {
        Document previous = room("ACTIVE", 1);
        previous.put(
                "schemaVersion",
                MongoRoomDocument.PREVIOUS_SCHEMA_VERSION);
        whenRoom(previous, previous);
        whenMembership(membership("ACTIVE", 1));

        var snapshot = reader.readAccess("user-1", "room-1");

        assertThat(snapshot.state())
                .isEqualTo(RoomAccessState.ACTIVE_MEMBER);
        assertThat(snapshot.messageVisibleAfterSequence())
                .isEqualTo(100);
    }

    @Test
    void retriesWhenRoomVersionChangesAroundMembershipRead() {
        whenRoom(
                room("ACTIVE", 3),
                room("ACTIVE", 4),
                room("ACTIVE", 4),
                room("ACTIVE", 4));
        whenMembership(
                membership("ACTIVE", 2),
                membership("LEFT", 3));

        assertThat(reader.readAccess("user-1", "room-1").state())
                .isEqualTo(RoomAccessState.MEMBERSHIP_LEFT);
    }

    @Test
    void failsWhenEveryAttemptObservesVersionChange() {
        whenRoom(
                room("ACTIVE", 1), room("ACTIVE", 2),
                room("ACTIVE", 2), room("ACTIVE", 3),
                room("ACTIVE", 3), room("ACTIVE", 4));
        whenMembership(
                membership("ACTIVE", 1),
                membership("ACTIVE", 1),
                membership("ACTIVE", 1));

        assertThatThrownBy(() ->
                reader.readAccess("user-1", "room-1"))
                .isInstanceOf(RoomAccessReadException.class);
    }

    @Test
    void closedRoomDoesNotReadMembership() {
        whenRoom(room("CLOSED", 5));

        assertThat(reader.readAccess("user-1", "room-1").state())
                .isEqualTo(RoomAccessState.ROOM_CLOSED);
        verify(mongo, never()).findOne(
                any(Query.class),
                eq(Document.class),
                eq(MongoMembershipDocument.COLLECTION_NAME));
    }

    @Test
    void rejectsUnsupportedSchemaVersion() {
        Document corrupt = room("ACTIVE", 1);
        corrupt.put("schemaVersion", 99);
        whenRoom(corrupt);

        assertThatThrownBy(() ->
                reader.readAccess("user-1", "room-1"))
                .isInstanceOf(RoomAccessReadException.class);
    }

    @Test
    void rejectsMembershipIdentityMismatch() {
        whenRoom(room("ACTIVE", 1), room("ACTIVE", 1));
        Document mismatched = membership("ACTIVE", 1);
        mismatched.put("roomId", "other-room");
        whenMembership(mismatched);

        assertThatThrownBy(() ->
                reader.readAccess("user-1", "room-1"))
                .isInstanceOf(RoomAccessReadException.class)
                .hasMessageContaining("identity mismatch");
    }

    @Test
    void membershipBoundaryIsFailClosedWhenMissingNegativeOrLegacy() {
        whenRoom(
                room("ACTIVE", 1),
                room("ACTIVE", 1),
                room("ACTIVE", 1));
        Document missing = membership("ACTIVE", 1);
        missing.remove("messageVisibleAfterSequence");
        whenMembership(missing);
        assertThatThrownBy(() ->
                reader.readAccess("user-1", "room-1"))
                .isInstanceOf(RoomAccessReadException.class);

        whenRoom(
                room("ACTIVE", 1),
                room("ACTIVE", 1),
                room("ACTIVE", 1));
        Document negative = membership("ACTIVE", 1);
        negative.put("messageVisibleAfterSequence", -1L);
        whenMembership(negative);
        assertThatThrownBy(() ->
                reader.readAccess("user-1", "room-1"))
                .isInstanceOf(RoomAccessReadException.class);

        whenRoom(
                room("ACTIVE", 1),
                room("ACTIVE", 1),
                room("ACTIVE", 1));
        Document legacy = membership("ACTIVE", 1);
        legacy.put("schemaVersion", 1);
        whenMembership(legacy);
        assertThatThrownBy(() ->
                reader.readAccess("user-1", "room-1"))
                .isInstanceOf(RoomAccessReadException.class);
    }

    private void whenRoom(Document... documents) {
        when(mongo.findOne(
                any(Query.class),
                eq(Document.class),
                eq(MongoRoomDocument.COLLECTION_NAME)))
                .thenReturn(documents[0], tail(documents));
    }

    private void whenMembership(Document... documents) {
        when(mongo.findOne(
                any(Query.class),
                eq(Document.class),
                eq(MongoMembershipDocument.COLLECTION_NAME)))
                .thenReturn(documents[0], tail(documents));
    }

    private static Document[] tail(Document[] documents) {
        return java.util.Arrays.copyOfRange(
                documents,
                1,
                documents.length);
    }

    private static Document room(String status, long version) {
        return new Document("_id", "room-1")
                .append("schemaVersion", 1)
                .append("status", status)
                .append("version", version);
    }

    private static Document membership(String status, long version) {
        return new Document("_id", "membership-1")
                .append(
                        "schemaVersion",
                        MongoMembershipDocument.CURRENT_SCHEMA_VERSION)
                .append("roomId", "room-1")
                .append("userId", "user-1")
                .append("status", status)
                .append("messageVisibleAfterSequence", 100L)
                .append("version", version);
    }
}
