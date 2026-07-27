package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoOperations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

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
                        0L));

        assertThatThrownBy(() -> allocator.next("room-1"))
                .isInstanceOf(ChatMessageStoreException.class)
                .satisfies(exception -> assertThat(
                        ((ChatMessageStoreException) exception).kind())
                        .isEqualTo(
                                ChatMessageStoreFailureKind.PERMANENT));
    }
}
