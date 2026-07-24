package com.hamcheeze.chat.message.inmemory;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ConflictingChatMessage;
import com.hamcheeze.chat.message.DuplicateChatMessage;
import com.hamcheeze.chat.message.IdempotencyKey;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoreChatMessageResult;
import com.hamcheeze.chat.message.StoredChatMessage;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

public final class InMemoryChatMessageStore
        implements ChatMessageStore {

    private final ReentrantLock lock = new ReentrantLock();
    private final Map<IdempotencyKey, ChatMessage> messagesByKey =
            new HashMap<>();
    private final Map<String, ChatMessage> messagesById =
            new HashMap<>();
    private final Map<String, Long> lastSequenceByRoom =
            new HashMap<>();
    private final Clock clock;
    private final Supplier<String> messageIdGenerator;
    private final Counter storedCounter;
    private final Counter duplicateCounter;
    private final Counter conflictCounter;
    private final Counter failureCounter;

    public InMemoryChatMessageStore(
            Clock clock,
            Supplier<String> messageIdGenerator,
            MeterRegistry meterRegistry
    ) {
        this.clock = Objects.requireNonNull(clock, "clock");
        this.messageIdGenerator = Objects.requireNonNull(
                messageIdGenerator, "messageIdGenerator");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.storedCounter =
                meterRegistry.counter("chat.message.store.stored");
        this.duplicateCounter =
                meterRegistry.counter("chat.message.store.duplicate");
        this.conflictCounter =
                meterRegistry.counter("chat.message.store.conflicts");
        this.failureCounter =
                meterRegistry.counter("chat.message.store.failures");
        Gauge.builder(
                        "chat.message.store.current_size",
                        this,
                        InMemoryChatMessageStore::size)
                .register(meterRegistry);
    }

    @Override
    public StoreChatMessageResult append(NewChatMessage newMessage) {
        Objects.requireNonNull(newMessage, "newMessage");
        lock.lock();
        try {
            ChatMessage existing = messagesByKey.get(
                    newMessage.idempotencyKey());
            if (existing != null) {
                if (existing.content().equals(newMessage.content())) {
                    duplicateCounter.increment();
                    return new DuplicateChatMessage(existing);
                }
                conflictCounter.increment();
                return new ConflictingChatMessage(existing);
            }

            String messageId = Objects.requireNonNull(
                    messageIdGenerator.get(),
                    "messageIdGenerator returned null");
            if (messagesById.containsKey(messageId)) {
                throw new ChatMessageStoreException(
                        "Generated duplicate messageId: " + messageId);
            }

            long roomSequence =
                    lastSequenceByRoom.getOrDefault(
                            newMessage.roomId(), 0L) + 1L;
            ChatMessage stored = new ChatMessage(
                    messageId,
                    newMessage.roomId(),
                    roomSequence,
                    newMessage.senderUserId(),
                    newMessage.clientMessageId(),
                    newMessage.content(),
                    clock.instant());

            messagesByKey.put(newMessage.idempotencyKey(), stored);
            messagesById.put(messageId, stored);
            lastSequenceByRoom.put(
                    newMessage.roomId(), roomSequence);
            storedCounter.increment();
            return new StoredChatMessage(stored);
        } catch (ChatMessageStoreException exception) {
            failureCounter.increment();
            throw exception;
        } catch (RuntimeException exception) {
            failureCounter.increment();
            throw new ChatMessageStoreException(
                    "Failed to append in-memory chat message",
                    exception);
        } finally {
            lock.unlock();
        }
    }

    public Optional<ChatMessage> findById(String messageId) {
        lock.lock();
        try {
            return Optional.ofNullable(messagesById.get(messageId));
        } finally {
            lock.unlock();
        }
    }

    public int size() {
        lock.lock();
        try {
            return messagesById.size();
        } finally {
            lock.unlock();
        }
    }
}
