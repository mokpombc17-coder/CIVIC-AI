package com.hamcheeze.chat.message.inmemory;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ConflictingChatMessage;
import com.hamcheeze.chat.message.DuplicateChatMessage;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoredChatMessage;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InMemoryChatMessageStoreTest {

    private final SimpleMeterRegistry meterRegistry =
            new SimpleMeterRegistry();
    private final AtomicInteger ids = new AtomicInteger();
    private InMemoryChatMessageStore store;

    @BeforeEach
    void setUp() {
        store = new InMemoryChatMessageStore(
                Clock.fixed(
                        Instant.parse("2026-07-24T00:00:00Z"),
                        ZoneOffset.UTC),
                () -> "message-" + ids.incrementAndGet(),
                meterRegistry);
    }

    @Test
    void storesMessagesWithIndependentRoomSequences() {
        StoredChatMessage first = (StoredChatMessage) store.append(
                message("room-1", "user-1", "client-1", "hello"));
        StoredChatMessage second = (StoredChatMessage) store.append(
                message("room-1", "user-1", "client-2", "again"));
        StoredChatMessage anotherRoom =
                (StoredChatMessage) store.append(
                        message(
                                "room-2",
                                "user-1",
                                "client-3",
                                "other"));

        assertThat(first.message().roomSequence()).isEqualTo(1);
        assertThat(second.message().roomSequence()).isEqualTo(2);
        assertThat(anotherRoom.message().roomSequence()).isEqualTo(1);
        assertThat(first.message().messageId()).isEqualTo("message-1");
        assertThat(first.message().createdAt()).isEqualTo(
                Instant.parse("2026-07-24T00:00:00Z"));
        assertThat(store.size()).isEqualTo(3);
        assertThat(meterRegistry.counter(
                "chat.message.store.stored").count()).isEqualTo(3);
    }

    @Test
    void sameKeyAndNormalizedContentReturnsOriginalDuplicate() {
        StoredChatMessage stored = (StoredChatMessage) store.append(
                message("room-1", "user-1", "client-1", "hello"));

        DuplicateChatMessage duplicate =
                (DuplicateChatMessage) store.append(
                        message(
                                "room-1",
                                "user-1",
                                "client-1",
                                "hello"));

        assertThat(duplicate.message()).isEqualTo(stored.message());
        assertThat(store.size()).isEqualTo(1);
        assertThat(meterRegistry.counter(
                "chat.message.store.duplicate").count()).isEqualTo(1);
    }

    @Test
    void sameKeyAndDifferentNormalizedContentReturnsConflict() {
        StoredChatMessage stored = (StoredChatMessage) store.append(
                message("room-1", "user-1", "client-1", "hello"));

        ConflictingChatMessage conflict =
                (ConflictingChatMessage) store.append(
                        message(
                                "room-1",
                                "user-1",
                                "client-1",
                                "changed"));
        StoredChatMessage next = (StoredChatMessage) store.append(
                message("room-1", "user-1", "client-2", "next"));

        assertThat(conflict.existingMessage())
                .isEqualTo(stored.message());
        assertThat(next.message().roomSequence()).isEqualTo(2);
        assertThat(store.size()).isEqualTo(2);
        assertThat(meterRegistry.counter(
                "chat.message.store.conflicts").count()).isEqualTo(1);
    }

    @Test
    void idempotencyKeyIncludesRoomAndSender() {
        ChatMessage first = ((StoredChatMessage) store.append(
                message(
                        "room-1",
                        "user-1",
                        "client-1",
                        "first"))).message();
        ChatMessage otherUser = ((StoredChatMessage) store.append(
                message(
                        "room-1",
                        "user-2",
                        "client-1",
                        "second"))).message();
        ChatMessage otherRoom = ((StoredChatMessage) store.append(
                message(
                        "room-2",
                        "user-1",
                        "client-1",
                        "third"))).message();

        assertThat(first.messageId()).isNotEqualTo(
                otherUser.messageId());
        assertThat(first.messageId()).isNotEqualTo(
                otherRoom.messageId());
        assertThat(store.size()).isEqualTo(3);
    }

    @Test
    void generatedMessageIdCollisionDoesNotAdvanceSequence() {
        InMemoryChatMessageStore collidingStore =
                new InMemoryChatMessageStore(
                        Clock.systemUTC(),
                        () -> "same-message-id",
                        meterRegistry);
        collidingStore.append(
                message("room-1", "user-1", "client-1", "first"));

        assertThatThrownBy(() -> collidingStore.append(
                message("room-1", "user-1", "client-2", "second")))
                .isInstanceOf(ChatMessageStoreException.class);
        assertThat(collidingStore.size()).isEqualTo(1);
        assertThat(meterRegistry.counter(
                "chat.message.store.failures").count()).isEqualTo(1);
    }

    @Test
    void concurrentAppendsAssignUniqueGaplessRoomSequences()
            throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(8);
        try {
            List<Future<StoredChatMessage>> futures =
                    new ArrayList<>();
            for (int index = 1; index <= 50; index++) {
                int current = index;
                futures.add(executor.submit(() ->
                        (StoredChatMessage) store.append(
                                message(
                                        "room-1",
                                        "user-" + current,
                                        "client-" + current,
                                        "message-" + current))));
            }

            List<Long> sequences = new ArrayList<>();
            for (Future<StoredChatMessage> future : futures) {
                sequences.add(
                        future.get(2, TimeUnit.SECONDS)
                                .message()
                                .roomSequence());
            }

            assertThat(sequences)
                    .containsExactlyInAnyOrderElementsOf(
                            java.util.stream.LongStream
                                    .rangeClosed(1, 50)
                                    .boxed()
                                    .toList());
            assertThat(store.size()).isEqualTo(50);
        } finally {
            executor.shutdownNow();
        }
    }

    private NewChatMessage message(
            String roomId,
            String userId,
            String clientMessageId,
            String content
    ) {
        return new NewChatMessage(
                roomId,
                userId,
                clientMessageId,
                content);
    }
}
