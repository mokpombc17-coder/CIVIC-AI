package com.hamcheeze.chat.message.query;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.room.authorization.RoomMessageAccess;
import com.hamcheeze.chat.room.authorization.RoomMessageAccessResolver;
import com.hamcheeze.chat.message.ChatMessage;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;

public final class ChatMessageHistoryService {

    private final ChatMessageHistoryReader reader;
    private final RoomMessageAccessResolver accessResolver;

    public ChatMessageHistoryService(
            ChatMessageHistoryReader reader,
            RoomMessageAccessResolver accessResolver
    ) {
        this.reader = Objects.requireNonNull(reader, "reader");
        this.accessResolver = Objects.requireNonNull(
                accessResolver,
                "accessResolver");
    }

    public ChatMessageHistoryPage findLatest(
            String userId,
            String roomId,
            int limit
    ) {
        requireCommonInputs(userId, roomId, limit);
        long boundary = requireBoundary(userId, roomId);
        return backwardPage(
                read(() -> reader.findLatest(
                        roomId,
                        boundary,
                        limit + 1)),
                limit);
    }

    public ChatMessageHistoryPage findBefore(
            String userId,
            String roomId,
            long beforeSequence,
            int limit
    ) {
        requireCommonInputs(userId, roomId, limit);
        if (beforeSequence < 1) {
            throw new IllegalArgumentException(
                    "beforeSequence must be at least 1");
        }
        long boundary = requireBoundary(userId, roomId);
        return backwardPage(
                read(() -> reader.findBefore(
                        roomId,
                        boundary,
                        beforeSequence,
                        limit + 1)),
                limit);
    }

    public ChatMessageHistoryPage findAfter(
            String userId,
            String roomId,
            long afterSequence,
            int limit
    ) {
        requireCommonInputs(userId, roomId, limit);
        if (afterSequence < 0) {
            throw new IllegalArgumentException(
                    "afterSequence must not be negative");
        }
        long boundary = requireBoundary(userId, roomId);
        long effectiveAfterSequence = Math.max(
                afterSequence,
                boundary);
        List<ChatMessage> found = read(() -> reader.findAfter(
                roomId,
                boundary,
                effectiveAfterSequence,
                limit + 1));
        boolean hasMore = found.size() > limit;
        List<ChatMessage> items = hasMore
                ? List.copyOf(found.subList(0, limit))
                : List.copyOf(found);
        Long nextAfterSequence = hasMore
                ? items.getLast().roomSequence()
                : null;
        return new ChatMessageHistoryPage(
                items,
                null,
                nextAfterSequence,
                hasMore);
    }

    private long requireBoundary(
            String userId,
            String roomId
    ) {
        RoomMessageAccess access = accessResolver.resolve(
                userId,
                roomId);
        if (access.decision() == RoomAuthorizationDecision.FORBIDDEN) {
            throw new ChatMessageHistoryException(
                    ChatMessageHistoryErrorCode.ACCESS_DENIED,
                    "Only an active room member can read messages");
        }
        if (access.decision() == RoomAuthorizationDecision.UNAVAILABLE) {
            throw new ChatMessageHistoryException(
                    ChatMessageHistoryErrorCode
                            .AUTHORIZATION_UNAVAILABLE,
                    "Room authorization is temporarily unavailable");
        }
        return access.messageVisibleAfterSequence();
    }

    private static ChatMessageHistoryPage backwardPage(
            List<ChatMessage> found,
            int limit
    ) {
        boolean hasMore = found.size() > limit;
        List<ChatMessage> newestFirst = hasMore
                ? found.subList(0, limit)
                : found;
        List<ChatMessage> items =
                new ArrayList<>(newestFirst);
        Collections.reverse(items);
        List<ChatMessage> immutableItems =
                List.copyOf(items);
        Long nextBeforeSequence = hasMore
                ? immutableItems.getFirst().roomSequence()
                : null;
        return new ChatMessageHistoryPage(
                immutableItems,
                nextBeforeSequence,
                null,
                hasMore);
    }

    private static List<ChatMessage> read(
            Supplier<List<ChatMessage>> operation
    ) {
        try {
            return operation.get();
        } catch (RuntimeException exception) {
            throw new ChatMessageHistoryException(
                    ChatMessageHistoryErrorCode
                            .MESSAGE_HISTORY_UNAVAILABLE,
                    "Message history is temporarily unavailable",
                    exception);
        }
    }

    private static void requireCommonInputs(
            String userId,
            String roomId,
            int limit
    ) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException(
                    "userId must not be blank");
        }
        if (roomId == null || roomId.isBlank()) {
            throw new IllegalArgumentException(
                    "roomId must not be blank");
        }
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException(
                    "limit must be between 1 and 100");
        }
    }
}
