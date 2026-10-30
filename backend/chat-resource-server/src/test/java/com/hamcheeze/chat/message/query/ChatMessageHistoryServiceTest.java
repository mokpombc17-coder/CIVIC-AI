package com.hamcheeze.chat.message.query;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.room.authorization.RoomMessageAccess;
import com.hamcheeze.chat.room.authorization.RoomMessageAccessResolver;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatMessageHistoryServiceTest {

    private final ChatMessageHistoryReader reader =
            mock(ChatMessageHistoryReader.class);
    private final RoomMessageAccessResolver accessResolver =
            mock(RoomMessageAccessResolver.class);
    private final ChatMessageHistoryService service =
            new ChatMessageHistoryService(reader, accessResolver);

    @Test
    void latestPageReturnsNewestMessagesInAscendingOrder() {
        allowHistory();
        when(reader.findLatest("room-1", 2, 3))
                .thenReturn(List.of(
                        message(7),
                        message(6),
                        message(5)));

        ChatMessageHistoryPage page = service.findLatest(
                "user-1",
                "room-1",
                2);

        assertThat(page.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(6L, 7L);
        assertThat(page.nextBeforeSequence()).isEqualTo(6);
        assertThat(page.nextAfterSequence()).isNull();
        assertThat(page.hasMore()).isTrue();
    }

    @Test
    void beforePageReturnsClosestOlderMessagesInAscendingOrder() {
        allowHistory();
        when(reader.findBefore("room-1", 2, 6, 3))
                .thenReturn(List.of(
                        message(5),
                        message(4),
                        message(3)));

        ChatMessageHistoryPage page = service.findBefore(
                "user-1",
                "room-1",
                6,
                2);

        assertThat(page.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(4L, 5L);
        assertThat(page.nextBeforeSequence()).isEqualTo(4);
        assertThat(page.nextAfterSequence()).isNull();
        assertThat(page.hasMore()).isTrue();
    }

    @Test
    void afterPageReturnsFollowingMessagesAndForwardCursor() {
        allowHistory();
        when(reader.findAfter("room-1", 2, 4, 3))
                .thenReturn(List.of(
                        message(5),
                        message(6),
                        message(7)));

        ChatMessageHistoryPage page = service.findAfter(
                "user-1",
                "room-1",
                4,
                2);

        assertThat(page.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(5L, 6L);
        assertThat(page.nextBeforeSequence()).isNull();
        assertThat(page.nextAfterSequence()).isEqualTo(6);
        assertThat(page.hasMore()).isTrue();
    }

    @Test
    void finalPageHasNoCursor() {
        allowHistory();
        when(reader.findBefore("room-1", 2, 6, 3))
                .thenReturn(List.of(message(5)));

        ChatMessageHistoryPage page = service.findBefore(
                "user-1",
                "room-1",
                6,
                2);

        assertThat(page.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(5L);
        assertThat(page.nextBeforeSequence()).isNull();
        assertThat(page.nextAfterSequence()).isNull();
        assertThat(page.hasMore()).isFalse();
    }

    @Test
    void rejectsNonMemberWithoutReadingMessages() {
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(RoomMessageAccess.forbidden());

        assertThatThrownBy(() -> service.findLatest(
                "user-1",
                "room-1",
                50))
                .isInstanceOf(ChatMessageHistoryException.class)
                .extracting(exception ->
                        ((ChatMessageHistoryException) exception).code())
                .isEqualTo(
                        ChatMessageHistoryErrorCode.ACCESS_DENIED);
        verify(reader, never()).findLatest("room-1", 0, 51);
    }

    @Test
    void mapsAuthorizationAndReaderFailures() {
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(RoomMessageAccess.unavailable());
        assertThatThrownBy(() -> service.findLatest(
                "user-1",
                "room-1",
                50))
                .isInstanceOf(ChatMessageHistoryException.class)
                .extracting(exception ->
                        ((ChatMessageHistoryException) exception).code())
                .isEqualTo(ChatMessageHistoryErrorCode
                        .AUTHORIZATION_UNAVAILABLE);

        allowHistory();
        when(reader.findLatest("room-1", 2, 51))
                .thenThrow(new IllegalStateException("mongo down"));
        assertThatThrownBy(() -> service.findLatest(
                "user-1",
                "room-1",
                50))
                .isInstanceOf(ChatMessageHistoryException.class)
                .extracting(exception ->
                        ((ChatMessageHistoryException) exception).code())
                .isEqualTo(ChatMessageHistoryErrorCode
                        .MESSAGE_HISTORY_UNAVAILABLE);
    }

    @Test
    void validatesDirectionalSequenceInputs() {
        assertThatThrownBy(() -> service.findBefore(
                "user-1",
                "room-1",
                0,
                50))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.findAfter(
                "user-1",
                "room-1",
                -1,
                50))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void forgedAfterCursorCannotMoveBelowMembershipBoundary() {
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(RoomMessageAccess.allowed(100));
        when(reader.findAfter("room-1", 100, 100, 3))
                .thenReturn(List.of(message(101), message(102)));

        ChatMessageHistoryPage page = service.findAfter(
                "user-1", "room-1", 0, 2);

        assertThat(page.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(101L, 102L);
        verify(reader).findAfter("room-1", 100, 100, 3);
    }

    private void allowHistory() {
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(RoomMessageAccess.allowed(2));
    }

    private ChatMessage message(long sequence) {
        return new ChatMessage(
                "message-" + sequence,
                "room-1",
                sequence,
                "user-1",
                "membership-1",
                "550e8400-e29b-41d4-a716-44665544%04d"
                        .formatted(sequence),
                "message " + sequence,
                Instant.parse("2026-07-29T00:00:00Z")
                        .plusSeconds(sequence));
    }
}
