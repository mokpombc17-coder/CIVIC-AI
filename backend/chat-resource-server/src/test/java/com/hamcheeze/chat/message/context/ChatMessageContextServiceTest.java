package com.hamcheeze.chat.message.context;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.search.ChatMessageSearchAccess;
import com.hamcheeze.chat.message.search.ChatMessageSearchAccessResolver;
import com.hamcheeze.chat.message.search.ChatMessageSearchErrorCode;
import com.hamcheeze.chat.message.search.ChatMessageSearchException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatMessageContextServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-10T03:00:00Z");

    private final ChatMessageContextReader reader =
            mock(ChatMessageContextReader.class);
    private final ChatMessageSearchAccessResolver accessResolver =
            mock(ChatMessageSearchAccessResolver.class);

    @BeforeEach
    void setUp() {
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(access(0));
    }

    @Test
    void assemblesAscendingWindowWithContinuationHints() {
        when(reader.findTarget(eq("message-5"), any(Duration.class)))
                .thenReturn(Optional.of(message(5, "room-1")));
        when(reader.findBefore(
                eq("room-1"), eq(0L), eq(5L), eq(3),
                any(Duration.class)))
                .thenReturn(List.of(
                        message(4, "room-1"),
                        message(3, "room-1"),
                        message(2, "room-1")));
        when(reader.findAfter(
                eq("room-1"), eq(5L), eq(3),
                any(Duration.class)))
                .thenReturn(List.of(
                        message(6, "room-1"),
                        message(7, "room-1"),
                        message(8, "room-1")));

        ChatMessageContext context = service().find(
                "user-1", "room-1", "message-5", 2, 2);

        assertThat(context.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(3L, 4L, 5L, 6L, 7L);
        assertThat(context.targetMessageId()).isEqualTo("message-5");
        assertThat(context.targetRoomSequence()).isEqualTo(5);
        assertThat(context.hasOlder()).isTrue();
        assertThat(context.hasNewer()).isTrue();
        assertThat(context.nextBeforeSequence()).isEqualTo(3);
        assertThat(context.nextAfterSequence()).isEqualTo(7);
    }

    @Test
    void zeroSizedWindowStillReportsAvailableDirections() {
        when(reader.findTarget(eq("message-5"), any(Duration.class)))
                .thenReturn(Optional.of(message(5, "room-1")));
        when(reader.findBefore(
                eq("room-1"), eq(0L), eq(5L), eq(1),
                any(Duration.class)))
                .thenReturn(List.of(message(4, "room-1")));
        when(reader.findAfter(
                eq("room-1"), eq(5L), eq(1),
                any(Duration.class)))
                .thenReturn(List.of(message(6, "room-1")));

        ChatMessageContext context = service().find(
                "user-1", "room-1", "message-5", 0, 0);

        assertThat(context.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(5L);
        assertThat(context.nextBeforeSequence()).isEqualTo(5);
        assertThat(context.nextAfterSequence()).isEqualTo(5);
    }

    @Test
    void missingOtherRoomAndBoundaryTargetsAreIndistinguishable() {
        when(reader.findTarget(eq("missing"), any(Duration.class)))
                .thenReturn(Optional.empty());
        when(reader.findTarget(eq("other-room"), any(Duration.class)))
                .thenReturn(Optional.of(message(5, "room-2")));
        when(reader.findTarget(eq("before-boundary"), any(Duration.class)))
                .thenReturn(Optional.of(message(5, "room-1")));

        assertNotFound("missing", access(0));
        assertNotFound("other-room", access(0));
        assertNotFound("before-boundary", access(5));
    }

    @Test
    void deletedTargetRemainsAsTombstone() {
        ChatMessage tombstone = tombstone(5);
        when(reader.findTarget(eq("message-5"), any(Duration.class)))
                .thenReturn(Optional.of(tombstone));
        when(reader.findBefore(
                any(), anyLong(), anyLong(), anyInt(), any()))
                .thenReturn(List.of());
        when(reader.findAfter(
                any(), anyLong(), anyInt(), any()))
                .thenReturn(List.of());

        ChatMessageContext context = service().find(
                "user-1", "room-1", "message-5", 2, 2);

        assertThat(context.items()).containsExactly(tombstone);
        assertThat(context.items().getFirst().content()).isNull();
        assertThat(context.items().getFirst().state())
                .isEqualTo(MessageState.DELETED_BY_AUTHOR);
    }

    @Test
    void storageFailureIsRetryableAndOrderingViolationFailsClosed() {
        when(reader.findTarget(eq("storage"), any(Duration.class)))
                .thenThrow(new ChatMessageContextReaderException(
                        ChatMessageContextReaderException.FailureKind
                                .STORAGE_UNAVAILABLE,
                        "timeout",
                        new RuntimeException("mongo timeout")));
        assertCode(
                "storage",
                ChatMessageSearchErrorCode.MESSAGE_SEARCH_UNAVAILABLE);

        when(reader.findTarget(eq("bad-order"), any(Duration.class)))
                .thenReturn(Optional.of(message(5, "room-1")));
        when(reader.findBefore(
                eq("room-1"), eq(0L), eq(5L), eq(3),
                any(Duration.class)))
                .thenReturn(List.of(
                        message(3, "room-1"),
                        message(4, "room-1")));
        assertCode("bad-order", ChatMessageSearchErrorCode.INTERNAL_ERROR);
    }

    @Test
    void accessChangeBeforeResponseFailsClosed() {
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(access(0), access(10));
        when(reader.findTarget(eq("message-5"), any(Duration.class)))
                .thenReturn(Optional.of(message(5, "room-1")));
        when(reader.findBefore(
                any(), anyLong(), anyLong(), anyInt(), any()))
                .thenReturn(List.of());
        when(reader.findAfter(
                any(), anyLong(), anyInt(), any()))
                .thenReturn(List.of());

        assertCode("message-5", ChatMessageSearchErrorCode.ACCESS_DENIED);
    }

    @Test
    void metricFailureDoesNotChangeContextResult() {
        ChatMessageContextMetrics metrics =
                mock(ChatMessageContextMetrics.class);
        doThrow(new IllegalStateException("metrics down"))
                .when(metrics).request();
        doThrow(new IllegalStateException("metrics down"))
                .when(metrics).success(any(Duration.class));
        when(reader.findTarget(eq("message-5"), any(Duration.class)))
                .thenReturn(Optional.of(message(5, "room-1")));
        when(reader.findBefore(
                any(), anyLong(), anyLong(), anyInt(), any()))
                .thenReturn(List.of());
        when(reader.findAfter(
                any(), anyLong(), anyInt(), any()))
                .thenReturn(List.of());

        ChatMessageContext context = service(metrics).find(
                "user-1", "room-1", "message-5", 1, 1);

        assertThat(context.targetMessageId()).isEqualTo("message-5");
    }

    private ChatMessageContextService service() {
        return service(ChatMessageContextMetrics.noop());
    }

    private ChatMessageContextService service(
            ChatMessageContextMetrics metrics
    ) {
        return new ChatMessageContextService(
                reader,
                accessResolver,
                Duration.ofMillis(500),
                metrics,
                () -> 0L);
    }

    private void assertNotFound(
            String messageId,
            ChatMessageSearchAccess access
    ) {
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(access);
        assertCode(messageId, ChatMessageSearchErrorCode.MESSAGE_NOT_FOUND);
    }

    private void assertCode(
            String messageId,
            ChatMessageSearchErrorCode code
    ) {
        assertThatThrownBy(() -> service().find(
                "user-1", "room-1", messageId, 2, 2))
                .isInstanceOf(ChatMessageSearchException.class)
                .extracting("code")
                .isEqualTo(code);
    }

    private ChatMessageSearchAccess access(long boundary) {
        return ChatMessageSearchAccess.allowed(
                "membership-1",
                1,
                boundary);
    }

    private ChatMessage message(long sequence, String roomId) {
        return new ChatMessage(
                "message-" + sequence,
                roomId,
                sequence,
                "sender-user",
                "sender-membership",
                "client-" + sequence,
                "message " + sequence,
                NOW);
    }

    private ChatMessage tombstone(long sequence) {
        return new ChatMessage(
                "message-" + sequence,
                "room-1",
                sequence,
                "sender-user",
                "sender-membership",
                "client-" + sequence,
                null,
                MessageState.DELETED_BY_AUTHOR,
                true,
                2,
                NOW,
                NOW.plusSeconds(1),
                NOW.plusSeconds(1));
    }
}
