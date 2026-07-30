package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Update;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

class MongoRoomSequenceAllocatorTest {

    private final MongoOperations mongoOperations =
            mock(MongoOperations.class);
    private final MongoRoomSequenceAllocator allocator =
            new MongoRoomSequenceAllocator(mongoOperations);

    @Test
    void nullFindAndModifyResultIsPermanentFailure() {
        assertThatThrownBy(() -> allocator.next("room-1"))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> assertThat(
                        ((ChatMessageStoreException) exception).kind())
                        .isEqualTo(
                                ChatMessageStoreFailureKind.PERMANENT));
    }

    @Test
    void nonPositiveSequenceIsPermanentFailure() {
        when(mongoOperations.findAndModify(
                any(),
                any(),
                any(),
                eq(MongoRoomSequenceDocument.class)))
                .thenReturn(new MongoRoomSequenceDocument(
                        "room-1",
                        0L,
                        0L));

        assertThatThrownBy(() -> allocator.next("room-1"))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> assertThat(
                        ((ChatMessageStoreException) exception).kind())
                        .isEqualTo(
                                ChatMessageStoreFailureKind.PERMANENT));
    }

    @Test
    void newSequenceDocumentInitializesBoundaryRevisionWithoutChangingSequence() {
        when(mongoOperations.findAndModify(
                any(),
                any(),
                any(),
                eq(MongoRoomSequenceDocument.class)))
                .thenReturn(new MongoRoomSequenceDocument(
                        "room-1", 1L, 0L));

        assertThat(allocator.next("room-1")).isEqualTo(1);

        ArgumentCaptor<Update> update =
                ArgumentCaptor.forClass(Update.class);
        verify(mongoOperations).findAndModify(
                any(),
                update.capture(),
                any(),
                eq(MongoRoomSequenceDocument.class));
        assertThat(update.getValue().getUpdateObject()
                .get("$setOnInsert", org.bson.Document.class))
                .containsEntry("boundaryRevision", 0L);
        assertThat(update.getValue().getUpdateObject()
                .get("$inc", org.bson.Document.class))
                .containsEntry("lastSequence", 1L);
    }
}
