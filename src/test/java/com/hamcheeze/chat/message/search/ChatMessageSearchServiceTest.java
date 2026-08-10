package com.hamcheeze.chat.message.search;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.room.inbox.RoomSequenceReader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongSupplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatMessageSearchServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-10T03:00:00Z");

    private final ChatMessageSearchReader reader =
            mock(ChatMessageSearchReader.class);
    private final ChatMessageSearchAccessResolver accessResolver =
            mock(ChatMessageSearchAccessResolver.class);
    private final RoomSequenceReader sequenceReader =
            mock(RoomSequenceReader.class);
    private final ChatMessageSearchNormalizer normalizer =
            new ChatMessageSearchNormalizer();
    private final ChatMessageSearchProperties properties =
            new ChatMessageSearchProperties();
    private final ChatMessageSearchCursorCodec cursorCodec =
            new ChatMessageSearchCursorCodec(
                    JsonMapper.builder().build(),
                    Clock.fixed(NOW, ZoneOffset.UTC),
                    Duration.ofMinutes(10));

    @BeforeEach
    void setUp() {
        properties.setCandidateChunkSize(5);
        properties.setMaxScannedPerRequest(5);
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(access());
        when(sequenceReader.currentSequence("room-1"))
                .thenReturn(10L);
    }

    @Test
    void cursorUsesLastScannedSequenceNotLastMatch() {
        when(reader.findCandidates(
                eq("room-1"), eq(0L), eq(10L), isNull(),
                eq(5), any(Duration.class)))
                .thenReturn(new ChatMessageSearchCandidateSlice(
                        List.of(
                                message(10, "match newest"),
                                message(9, "other"),
                                message(8, "other"),
                                message(7, "match older"),
                                message(6, "other")),
                        true));

        ChatMessageSearchCriteria criteria = criteria("match", 3);
        ChatMessageSearchPage page = service().search(
                "user-1", "room-1", criteria, null);

        assertThat(page.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(10L, 7L);
        assertThat(page.searchComplete()).isFalse();
        ChatMessageSearchCursor decoded = cursorCodec.decode(
                page.nextCursor(),
                binding(criteria));
        assertThat(decoded.nextBeforeSequence()).isEqualTo(6);
    }

    @Test
    void resultLimitStopsAtLastActuallyInspectedCandidate() {
        when(reader.findCandidates(
                eq("room-1"), eq(0L), eq(10L), isNull(),
                eq(5), any(Duration.class)))
                .thenReturn(new ChatMessageSearchCandidateSlice(
                        List.of(
                                message(10, "match one"),
                                message(9, "other"),
                                message(8, "match two"),
                                message(7, "match uninspected"),
                                message(6, "other")),
                        true));

        ChatMessageSearchCriteria criteria = criteria("match", 2);
        ChatMessageSearchPage page = service().search(
                "user-1", "room-1", criteria, null);

        assertThat(page.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(10L, 8L);
        assertThat(cursorCodec.decode(
                page.nextCursor(),
                binding(criteria)).nextBeforeSequence()).isEqualTo(8);
    }

    @Test
    void emptyScannedPageCanRemainIncomplete() {
        when(reader.findCandidates(
                eq("room-1"), eq(0L), eq(10L), isNull(),
                eq(5), any(Duration.class)))
                .thenReturn(new ChatMessageSearchCandidateSlice(
                        List.of(
                                message(10, "other"),
                                message(9, "other"),
                                message(8, "other"),
                                message(7, "other"),
                                message(6, "other")),
                        true));

        ChatMessageSearchPage page = service().search(
                "user-1", "room-1", criteria("match", 3), null);

        assertThat(page.items()).isEmpty();
        assertThat(page.searchComplete()).isFalse();
        assertThat(page.nextCursor()).isNotBlank();
    }

    @Test
    void exhaustsCandidateRangeAndCompletesWithoutCursor() {
        when(reader.findCandidates(
                eq("room-1"), eq(0L), eq(10L), isNull(),
                eq(5), any(Duration.class)))
                .thenReturn(new ChatMessageSearchCandidateSlice(
                        List.of(
                                message(3, "other"),
                                message(2, "match")),
                        false));

        ChatMessageSearchPage page = service().search(
                "user-1", "room-1", criteria("match", 3), null);

        assertThat(page.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(2L);
        assertThat(page.searchComplete()).isTrue();
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void exactResultLimitOnFinalCandidateStillCompletes() {
        when(reader.findCandidates(
                eq("room-1"), eq(0L), eq(10L), isNull(),
                eq(5), any(Duration.class)))
                .thenReturn(new ChatMessageSearchCandidateSlice(
                        List.of(
                                message(3, "match one"),
                                message(2, "match two")),
                        false));

        ChatMessageSearchPage page = service().search(
                "user-1", "room-1", criteria("match", 2), null);

        assertThat(page.items()).hasSize(2);
        assertThat(page.searchComplete()).isTrue();
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void continuationKeepsInitialUpperBoundWhenNewMessagesArrive() {
        properties.setCandidateChunkSize(2);
        properties.setMaxScannedPerRequest(2);
        when(sequenceReader.currentSequence("room-1"))
                .thenReturn(10L, 12L);
        when(reader.findCandidates(
                eq("room-1"), eq(0L), eq(10L), isNull(),
                eq(2), any(Duration.class)))
                .thenReturn(new ChatMessageSearchCandidateSlice(
                        List.of(message(10, "other"), message(9, "other")),
                        true));
        when(reader.findCandidates(
                eq("room-1"), eq(0L), eq(10L), eq(9L),
                eq(2), any(Duration.class)))
                .thenReturn(new ChatMessageSearchCandidateSlice(
                        List.of(message(8, "match")),
                        false));
        ChatMessageSearchCriteria criteria = criteria("match", 2);

        ChatMessageSearchPage first = service().search(
                "user-1", "room-1", criteria, null);
        ChatMessageSearchPage second = service().search(
                "user-1", "room-1", criteria, first.nextCursor());

        assertThat(second.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(8L);
        assertThat(second.searchComplete()).isTrue();
        verify(reader, never()).findCandidates(
                eq("room-1"), eq(0L), eq(12L), nullable(Long.class),
                anyInt(), any(Duration.class));
    }

    @Test
    void failsWholeRequestWhenStorageFails() {
        when(reader.findCandidates(
                any(), anyLong(), anyLong(), nullable(Long.class),
                anyInt(), any(Duration.class)))
                .thenThrow(new ChatMessageSearchReaderException(
                        ChatMessageSearchReaderException.FailureKind
                                .STORAGE_UNAVAILABLE,
                        "timeout",
                        new RuntimeException("mongo timeout")));

        assertThatThrownBy(() -> service().search(
                "user-1", "room-1", criteria("match", 2), null))
                .isInstanceOf(ChatMessageSearchException.class)
                .extracting("code")
                .isEqualTo(
                        ChatMessageSearchErrorCode
                                .MESSAGE_SEARCH_UNAVAILABLE);
    }

    @Test
    void failsClosedWhenAccessChangesBeforeResponse() {
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(
                        access(),
                        ChatMessageSearchAccess.allowed(
                                "membership-1", 2, 0));
        when(reader.findCandidates(
                any(), anyLong(), anyLong(), nullable(Long.class),
                anyInt(), any(Duration.class)))
                .thenReturn(new ChatMessageSearchCandidateSlice(
                        List.of(message(2, "match")),
                        false));

        assertThatThrownBy(() -> service().search(
                "user-1", "room-1", criteria("match", 2), null))
                .isInstanceOf(ChatMessageSearchException.class)
                .extracting("code")
                .isEqualTo(
                        ChatMessageSearchErrorCode
                                .MESSAGE_SEARCH_UNAVAILABLE);
    }

    @Test
    void deadlineBeforeFirstCandidateIsUnavailable() {
        AtomicInteger calls = new AtomicInteger();
        LongSupplier nanoTime = () -> calls.getAndIncrement() == 0
                ? 0L
                : Duration.ofSeconds(1).toNanos();

        assertThatThrownBy(() -> service(nanoTime).search(
                "user-1", "room-1", criteria("match", 2), null))
                .isInstanceOf(ChatMessageSearchException.class)
                .extracting("code")
                .isEqualTo(
                        ChatMessageSearchErrorCode
                                .MESSAGE_SEARCH_UNAVAILABLE);
        verify(reader, never()).findCandidates(
                any(), anyLong(), anyLong(), nullable(Long.class),
                anyInt(), any(Duration.class));
    }

    @Test
    void deadlineAfterCandidateReturnsProgressCursor() {
        when(reader.findCandidates(
                any(), anyLong(), anyLong(), nullable(Long.class),
                anyInt(), any(Duration.class)))
                .thenReturn(new ChatMessageSearchCandidateSlice(
                        List.of(
                                message(10, "match"),
                                message(9, "other")),
                        true));
        AtomicInteger calls = new AtomicInteger();
        LongSupplier nanoTime = () -> calls.getAndIncrement() < 3
                ? 0L
                : Duration.ofSeconds(1).toNanos();
        ChatMessageSearchCriteria criteria = criteria("match", 2);

        ChatMessageSearchPage page = service(nanoTime).search(
                "user-1", "room-1", criteria, null);

        assertThat(page.items())
                .extracting(ChatMessage::roomSequence)
                .containsExactly(10L);
        assertThat(page.searchComplete()).isFalse();
        assertThat(cursorCodec.decode(
                page.nextCursor(),
                binding(criteria)).nextBeforeSequence()).isEqualTo(10);
    }

    @Test
    void readerOrderingViolationIsNonRetryableInternalError() {
        when(reader.findCandidates(
                any(), anyLong(), anyLong(), nullable(Long.class),
                anyInt(), any(Duration.class)))
                .thenReturn(new ChatMessageSearchCandidateSlice(
                        List.of(
                                message(8, "match"),
                                message(9, "match")),
                        false));

        assertThatThrownBy(() -> service().search(
                "user-1", "room-1", criteria("match", 2), null))
                .isInstanceOf(ChatMessageSearchException.class)
                .extracting("code")
                .isEqualTo(ChatMessageSearchErrorCode.INTERNAL_ERROR);
    }

    private ChatMessageSearchService service() {
        return service(() -> 0L);
    }

    private ChatMessageSearchService service(LongSupplier nanoTime) {
        return new ChatMessageSearchService(
                reader,
                accessResolver,
                sequenceReader,
                normalizer,
                cursorCodec,
                properties,
                nanoTime);
    }

    private ChatMessageSearchCriteria criteria(
            String query,
            int limit
    ) {
        return ChatMessageSearchCriteria.resolve(
                query,
                limit,
                normalizer,
                properties);
    }

    private ChatMessageSearchCursorBinding binding(
            ChatMessageSearchCriteria criteria
    ) {
        return new ChatMessageSearchCursorBinding(
                "room-1",
                "membership-1",
                1,
                0,
                criteria.normalizedQueryFingerprint(),
                criteria.resultLimit());
    }

    private ChatMessageSearchAccess access() {
        return ChatMessageSearchAccess.allowed(
                "membership-1",
                1,
                0);
    }

    private ChatMessage message(long sequence, String content) {
        return new ChatMessage(
                "message-" + sequence,
                "room-1",
                sequence,
                "sender-user",
                "sender-membership",
                "client-" + sequence,
                content,
                NOW);
    }
}
