package com.hamcheeze.chat.message.query;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.message.ChatMessage;

import java.util.List;
import java.util.Objects;

public final class ChatMessageHistoryService {

    private final ChatMessageHistoryReader reader;
    private final RoomAuthorizationService authorizationService;

    public ChatMessageHistoryService(
            ChatMessageHistoryReader reader,
            RoomAuthorizationService authorizationService
    ) {
        this.reader = Objects.requireNonNull(reader, "reader");
        this.authorizationService = Objects.requireNonNull(
                authorizationService,
                "authorizationService");
    }

    public ChatMessageHistoryPage findAfter(
            String userId,
            String roomId,
            long afterSequence,
            int limit
    ) {
        requireInputs(userId, roomId, afterSequence, limit);
        RoomAuthorizationDecision decision =
                authorizationService.authorizeMessageHistory(
                        userId,
                        roomId);
        if (decision == RoomAuthorizationDecision.FORBIDDEN) {
            throw new ChatMessageHistoryException(
                    ChatMessageHistoryErrorCode.ACCESS_DENIED,
                    "Only an active room member can read messages");
        }
        if (decision == RoomAuthorizationDecision.UNAVAILABLE) {
            throw new ChatMessageHistoryException(
                    ChatMessageHistoryErrorCode
                            .AUTHORIZATION_UNAVAILABLE,
                    "Room authorization is temporarily unavailable");
        }

        List<ChatMessage> found;
        try {
            found = reader.findAfter(
                    roomId,
                    afterSequence,
                    limit + 1);
        } catch (RuntimeException exception) {
            throw new ChatMessageHistoryException(
                    ChatMessageHistoryErrorCode
                            .MESSAGE_HISTORY_UNAVAILABLE,
                    "Message history is temporarily unavailable",
                    exception);
        }
        boolean hasNext = found.size() > limit;
        List<ChatMessage> items = hasNext
                ? List.copyOf(found.subList(0, limit))
                : List.copyOf(found);
        Long nextAfterSequence = hasNext
                ? items.getLast().roomSequence()
                : null;
        return new ChatMessageHistoryPage(
                items,
                nextAfterSequence,
                hasNext);
    }

    private static void requireInputs(
            String userId,
            String roomId,
            long afterSequence,
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
        if (afterSequence < 0) {
            throw new IllegalArgumentException(
                    "afterSequence must not be negative");
        }
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException(
                    "limit must be between 1 and 100");
        }
    }
}
