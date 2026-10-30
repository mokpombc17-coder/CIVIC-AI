package com.hamcheeze.chat.message.context;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.search.ChatMessageSearchAccess;
import com.hamcheeze.chat.message.search.ChatMessageSearchAccessResolver;
import com.hamcheeze.chat.message.search.ChatMessageSearchErrorCode;
import com.hamcheeze.chat.message.search.ChatMessageSearchException;
import com.hamcheeze.chat.message.search.ChatMessageSearchProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

public final class ChatMessageContextService {

    private final ChatMessageContextReader reader;
    private final ChatMessageSearchAccessResolver accessResolver;
    private final Duration mongoQueryMaxTime;
    private final ChatMessageContextMetrics metrics;
    private final LongSupplier nanoTime;

    public ChatMessageContextService(
            ChatMessageContextReader reader,
            ChatMessageSearchAccessResolver accessResolver,
            ChatMessageSearchProperties properties,
            ChatMessageContextMetrics metrics
    ) {
        this(
                reader,
                accessResolver,
                properties.getMongoQueryMaxTime(),
                metrics,
                System::nanoTime);
    }

    ChatMessageContextService(
            ChatMessageContextReader reader,
            ChatMessageSearchAccessResolver accessResolver,
            Duration mongoQueryMaxTime,
            ChatMessageContextMetrics metrics,
            LongSupplier nanoTime
    ) {
        this.reader = Objects.requireNonNull(reader, "reader");
        this.accessResolver = Objects.requireNonNull(
                accessResolver,
                "accessResolver");
        this.mongoQueryMaxTime = Objects.requireNonNull(
                mongoQueryMaxTime,
                "mongoQueryMaxTime");
        if (mongoQueryMaxTime.toNanos() < 1_000_000) {
            throw new IllegalArgumentException(
                    "mongoQueryMaxTime must be at least 1ms");
        }
        this.metrics = Objects.requireNonNull(metrics, "metrics");
        this.nanoTime = Objects.requireNonNull(nanoTime, "nanoTime");
    }

    public ChatMessageContext find(
            String userId,
            String roomId,
            String messageId,
            int before,
            int after
    ) {
        requireInputs(userId, roomId, messageId, before, after);
        long startedAt = nanoTime.getAsLong();
        recordMetric(metrics::request);
        try {
            ChatMessageSearchAccess initialAccess = requireAccess(
                    accessResolver.resolve(userId, roomId));
            ChatMessage target = readTarget(messageId)
                    .filter(message -> roomId.equals(message.roomId()))
                    .filter(message -> message.roomSequence()
                            > initialAccess
                            .messageVisibleAfterSequence())
                    .orElseThrow(this::notFound);

            List<ChatMessage> beforeFound = read(() ->
                    reader.findBefore(
                            roomId,
                            initialAccess.messageVisibleAfterSequence(),
                            target.roomSequence(),
                            before + 1,
                            mongoQueryMaxTime));
            List<ChatMessage> afterFound = read(() ->
                    reader.findAfter(
                            roomId,
                            target.roomSequence(),
                            after + 1,
                            mongoQueryMaxTime));
            verifyBefore(
                    beforeFound,
                    roomId,
                    initialAccess.messageVisibleAfterSequence(),
                    target.roomSequence(),
                    before + 1);
            verifyAfter(
                    afterFound,
                    roomId,
                    target.roomSequence(),
                    after + 1);

            boolean hasOlder = beforeFound.size() > before;
            boolean hasNewer = afterFound.size() > after;
            List<ChatMessage> beforeItems = new ArrayList<>(
                    beforeFound.subList(
                            0,
                            Math.min(before, beforeFound.size())));
            Collections.reverse(beforeItems);
            List<ChatMessage> afterItems = afterFound.subList(
                    0,
                    Math.min(after, afterFound.size()));
            List<ChatMessage> items = new ArrayList<>(
                    beforeItems.size() + 1 + afterItems.size());
            items.addAll(beforeItems);
            items.add(target);
            items.addAll(afterItems);

            verifyAccessUnchanged(
                    userId,
                    roomId,
                    initialAccess);
            ChatMessageContext context = new ChatMessageContext(
                    target.messageId(),
                    target.roomSequence(),
                    items,
                    hasOlder ? items.getFirst().roomSequence() : null,
                    hasNewer ? items.getLast().roomSequence() : null,
                    hasOlder,
                    hasNewer);
            recordMetric(() -> metrics.success(
                    elapsedSince(startedAt)));
            return context;
        } catch (ChatMessageSearchException exception) {
            recordMetric(() -> metrics.failure(
                    exception.code(),
                    elapsedSince(startedAt)));
            throw exception;
        } catch (RuntimeException exception) {
            ChatMessageSearchException wrapped = internal(
                    "Message context assembly failed",
                    exception);
            recordMetric(() -> metrics.failure(
                    wrapped.code(),
                    elapsedSince(startedAt)));
            throw wrapped;
        }
    }

    private Optional<ChatMessage> readTarget(String messageId) {
        try {
            return Objects.requireNonNull(
                    reader.findTarget(messageId, mongoQueryMaxTime),
                    "target result");
        } catch (ChatMessageContextReaderException exception) {
            throw mapReaderFailure(exception);
        } catch (RuntimeException exception) {
            throw internal("Message context reader contract failed", exception);
        }
    }

    private List<ChatMessage> read(
            Supplier<List<ChatMessage>> operation
    ) {
        try {
            return List.copyOf(Objects.requireNonNull(
                    operation.get(),
                    "context messages"));
        } catch (ChatMessageContextReaderException exception) {
            throw mapReaderFailure(exception);
        } catch (RuntimeException exception) {
            throw internal("Message context reader contract failed", exception);
        }
    }

    private ChatMessageSearchException mapReaderFailure(
            ChatMessageContextReaderException exception
    ) {
        if (exception.kind()
                == ChatMessageContextReaderException.FailureKind
                .STORAGE_UNAVAILABLE) {
            return unavailable("Message context storage is unavailable",
                    exception);
        }
        return internal("Message context data is inconsistent", exception);
    }

    private void verifyBefore(
            List<ChatMessage> messages,
            String roomId,
            long boundary,
            long targetSequence,
            int maximum
    ) {
        if (messages.size() > maximum) {
            throw internal("Context reader exceeded before limit");
        }
        long previous = targetSequence;
        for (ChatMessage message : messages) {
            if (!roomId.equals(message.roomId())
                    || message.roomSequence() <= boundary
                    || message.roomSequence() >= previous) {
                throw internal("Context reader returned invalid before data");
            }
            previous = message.roomSequence();
        }
    }

    private void verifyAfter(
            List<ChatMessage> messages,
            String roomId,
            long targetSequence,
            int maximum
    ) {
        if (messages.size() > maximum) {
            throw internal("Context reader exceeded after limit");
        }
        long previous = targetSequence;
        for (ChatMessage message : messages) {
            if (!roomId.equals(message.roomId())
                    || message.roomSequence() <= previous) {
                throw internal("Context reader returned invalid after data");
            }
            previous = message.roomSequence();
        }
    }

    private void verifyAccessUnchanged(
            String userId,
            String roomId,
            ChatMessageSearchAccess initial
    ) {
        ChatMessageSearchAccess current = requireAccess(
                accessResolver.resolve(userId, roomId));
        if (!initial.membershipId().equals(current.membershipId())
                || !initial.messageVisibleAfterSequence().equals(
                current.messageVisibleAfterSequence())) {
            throw new ChatMessageSearchException(
                    ChatMessageSearchErrorCode.ACCESS_DENIED,
                    "Room access changed during message context query");
        }
    }

    private ChatMessageSearchAccess requireAccess(
            ChatMessageSearchAccess access
    ) {
        Objects.requireNonNull(access, "access");
        return switch (access.state()) {
            case ALLOWED -> access;
            case ACCESS_DENIED -> throw new ChatMessageSearchException(
                    ChatMessageSearchErrorCode.ACCESS_DENIED,
                    "An active room membership is required");
            case ROOM_NOT_AVAILABLE ->
                    throw new ChatMessageSearchException(
                            ChatMessageSearchErrorCode
                                    .MESSAGE_SEARCH_NOT_AVAILABLE,
                            "Message context is not available for this room");
            case UNAVAILABLE -> throw unavailable(
                    "Message context authorization is unavailable");
        };
    }

    private void requireInputs(
            String userId,
            String roomId,
            String messageId,
            int before,
            int after
    ) {
        if (userId == null || userId.isBlank()
                || roomId == null || roomId.isBlank()
                || messageId == null || messageId.isBlank()) {
            throw new IllegalArgumentException(
                    "Context identity must not be blank");
        }
        if (before < 0 || before > 50
                || after < 0 || after > 50
                || before + after > 100) {
            throw new IllegalArgumentException(
                    "Context window is out of range");
        }
    }

    private Duration elapsedSince(long startedAt) {
        return Duration.ofNanos(Math.max(
                0,
                nanoTime.getAsLong() - startedAt));
    }

    private void recordMetric(Runnable recording) {
        try {
            recording.run();
        } catch (RuntimeException ignored) {
            // Observability failures must not affect context processing.
        }
    }

    private ChatMessageSearchException notFound() {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.MESSAGE_NOT_FOUND,
                "Message was not found");
    }

    private ChatMessageSearchException unavailable(String message) {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.MESSAGE_SEARCH_UNAVAILABLE,
                message);
    }

    private ChatMessageSearchException unavailable(
            String message,
            Throwable cause
    ) {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.MESSAGE_SEARCH_UNAVAILABLE,
                message,
                cause);
    }

    private ChatMessageSearchException internal(String message) {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.INTERNAL_ERROR,
                message);
    }

    private ChatMessageSearchException internal(
            String message,
            Throwable cause
    ) {
        return new ChatMessageSearchException(
                ChatMessageSearchErrorCode.INTERNAL_ERROR,
                message,
                cause);
    }
}
