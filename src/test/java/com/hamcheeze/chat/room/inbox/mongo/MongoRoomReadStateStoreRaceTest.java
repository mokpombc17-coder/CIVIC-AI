package com.hamcheeze.chat.room.inbox.mongo;

import com.hamcheeze.chat.room.inbox.RoomReadStateAdvance;
import com.mongodb.client.result.UpdateResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.UpdateDefinition;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MongoRoomReadStateStoreRaceTest {

    private static final Instant FIRST =
            Instant.parse("2026-08-03T01:00:00Z");
    private static final Instant SECOND = FIRST.plusSeconds(1);

    private MongoOperations mongoOperations;
    private MongoRoomReadStateStore store;

    @BeforeEach
    void setUp() {
        mongoOperations = mock(MongoOperations.class);
        store = new MongoRoomReadStateStore(mongoOperations);
    }

    @Test
    void retriesWhenLowerCursorAppearsAfterConditionalUpdateMiss() {
        when(mongoOperations.updateFirst(
                any(Query.class),
                any(UpdateDefinition.class),
                eq(MongoRoomReadStateDocument.COLLECTION_NAME)))
                .thenReturn(updateResult(0), updateResult(1));
        when(findByMembershipId())
                .thenReturn(document(10, FIRST), document(20, SECOND));

        RoomReadStateAdvance result = store.advance(
                "membership-1", "room-1", "user-1", 20, SECOND);

        assertThat(result.updated()).isTrue();
        assertThat(result.state().lastReadSequence()).isEqualTo(20);
        assertThat(result.state().updatedAt()).isEqualTo(SECOND);
        verify(mongoOperations, times(2)).updateFirst(
                any(Query.class),
                any(UpdateDefinition.class),
                eq(MongoRoomReadStateDocument.COLLECTION_NAME));
    }

    @Test
    void retryExhaustionNeverReturnsPersistedLowerCursorAsNoop() {
        when(mongoOperations.updateFirst(
                any(Query.class),
                any(UpdateDefinition.class),
                eq(MongoRoomReadStateDocument.COLLECTION_NAME)))
                .thenReturn(updateResult(0));
        when(findByMembershipId()).thenReturn(document(10, FIRST));

        assertThatThrownBy(() -> store.advance(
                "membership-1", "room-1", "user-1", 20, SECOND))
                .isInstanceOf(ConcurrencyFailureException.class);

        verify(mongoOperations,
                times(MongoRoomReadStateStore.MAX_ADVANCE_ATTEMPTS))
                .updateFirst(
                        any(Query.class),
                        any(UpdateDefinition.class),
                        eq(MongoRoomReadStateDocument.COLLECTION_NAME));
    }

    @Test
    void identityCollisionRemainsNonRetryable() {
        when(mongoOperations.updateFirst(
                any(Query.class),
                any(UpdateDefinition.class),
                eq(MongoRoomReadStateDocument.COLLECTION_NAME)))
                .thenReturn(updateResult(0));
        when(findByMembershipId()).thenReturn(new MongoRoomReadStateDocument(
                "membership-1",
                MongoRoomReadStateDocument.CURRENT_SCHEMA_VERSION,
                "different-room",
                "user-1",
                10,
                FIRST));

        assertThatThrownBy(() -> store.advance(
                "membership-1", "room-1", "user-1", 20, SECOND))
                .isInstanceOf(IllegalStateException.class)
                .isNotInstanceOf(ConcurrencyFailureException.class);
    }

    @Test
    void unresolvedUniqueUserRoomCollisionRemainsDuplicateKey() {
        DuplicateKeyException duplicate = new DuplicateKeyException(
                "user-room identity collision");
        when(mongoOperations.updateFirst(
                any(Query.class),
                any(UpdateDefinition.class),
                eq(MongoRoomReadStateDocument.COLLECTION_NAME)))
                .thenReturn(updateResult(0));
        when(findByMembershipId()).thenReturn(null);
        doThrow(duplicate).when(mongoOperations).insert(
                any(MongoRoomReadStateDocument.class),
                eq(MongoRoomReadStateDocument.COLLECTION_NAME));

        assertThatThrownBy(() -> store.advance(
                "membership-1", "room-1", "user-1", 20, SECOND))
                .isSameAs(duplicate);
    }

    private MongoRoomReadStateDocument findByMembershipId() {
        return mongoOperations.findById(
                "membership-1",
                MongoRoomReadStateDocument.class,
                MongoRoomReadStateDocument.COLLECTION_NAME);
    }

    private MongoRoomReadStateDocument document(
            long sequence,
            Instant updatedAt
    ) {
        return new MongoRoomReadStateDocument(
                "membership-1",
                MongoRoomReadStateDocument.CURRENT_SCHEMA_VERSION,
                "room-1",
                "user-1",
                sequence,
                updatedAt);
    }

    private static UpdateResult updateResult(long modifiedCount) {
        return UpdateResult.acknowledged(
                modifiedCount, modifiedCount, null);
    }
}
