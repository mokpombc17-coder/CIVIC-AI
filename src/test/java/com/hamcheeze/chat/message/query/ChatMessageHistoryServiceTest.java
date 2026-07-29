package com.hamcheeze.chat.message.query;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.message.ChatMessage;
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
    private final RoomAuthorizationService authorization =
            mock(RoomAuthorizationService.class);
    private final ChatMessageHistoryService service =
            new ChatMessageHistoryService(reader, authorization);

    @Test
    void returnsAscendingPageAndSequenceCursor() {
        when(authorization.authorizeMessageHistory(
                "user-1",
                "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(reader.findAfter("room-1", 4, 3))
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
        assertThat(page.hasNext()).isTrue();
        assertThat(page.nextAfterSequence()).isEqualTo(6);
    }

    @Test
    void finalPageHasNoNextCursor() {
        when(authorization.authorizeMessageHistory(
                "user-1",
                "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(reader.findAfter("room-1", 6, 3))
                .thenReturn(List.of(message(7)));

        ChatMessageHistoryPage page = service.findAfter(
                "user-1",
                "room-1",
                6,
                2);

        assertThat(page.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(7L);
        assertThat(page.hasNext()).isFalse();
        assertThat(page.nextAfterSequence()).isNull();
    }

    @Test
    void rejectsNonMemberWithoutReadingMessages() {
        when(authorization.authorizeMessageHistory(
                "user-1",
                "room-1"))
                .thenReturn(RoomAuthorizationDecision.FORBIDDEN);

        assertThatThrownBy(() -> service.findAfter(
                "user-1",
                "room-1",
                0,
                50))
                .isInstanceOf(ChatMessageHistoryException.class)
                .extracting(exception ->
                        ((ChatMessageHistoryException) exception).code())
                .isEqualTo(
                        ChatMessageHistoryErrorCode.ACCESS_DENIED);
        verify(reader, never()).findAfter(
                "room-1",
                0,
                51);
    }

    @Test
    void mapsAuthorizationAndReaderFailures() {
        when(authorization.authorizeMessageHistory(
                "user-1",
                "room-1"))
                .thenReturn(RoomAuthorizationDecision.UNAVAILABLE);
        assertThatThrownBy(() -> service.findAfter(
                "user-1",
                "room-1",
                0,
                50))
                .isInstanceOf(ChatMessageHistoryException.class)
                .extracting(exception ->
                        ((ChatMessageHistoryException) exception).code())
                .isEqualTo(ChatMessageHistoryErrorCode
                        .AUTHORIZATION_UNAVAILABLE);

        when(authorization.authorizeMessageHistory(
                "user-1",
                "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(reader.findAfter("room-1", 0, 51))
                .thenThrow(new IllegalStateException("mongo down"));
        assertThatThrownBy(() -> service.findAfter(
                "user-1",
                "room-1",
                0,
                50))
                .isInstanceOf(ChatMessageHistoryException.class)
                .extracting(exception ->
                        ((ChatMessageHistoryException) exception).code())
                .isEqualTo(ChatMessageHistoryErrorCode
                        .MESSAGE_HISTORY_UNAVAILABLE);
    }

    private ChatMessage message(long sequence) {
        return new ChatMessage(
                "message-" + sequence,
                "room-1",
                sequence,
                "user-1",
                "550e8400-e29b-41d4-a716-44665544%04d"
                        .formatted(sequence),
                "message " + sequence,
                Instant.parse("2026-07-29T00:00:00Z")
                        .plusSeconds(sequence));
    }
}
