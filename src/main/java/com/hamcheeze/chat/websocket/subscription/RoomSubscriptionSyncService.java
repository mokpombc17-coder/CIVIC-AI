package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.query.ChatMessageHistoryReader;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public final class RoomSubscriptionSyncService {

    private final ChatSubscriptionRegistry subscriptions;
    private final RoomAuthorizationService authorizationService;
    private final ChatMessageHistoryReader historyReader;
    private final SubscriptionResultSender resultSender;

    public RoomSubscriptionSyncService(
            ChatSubscriptionRegistry subscriptions,
            RoomAuthorizationService authorizationService,
            ChatMessageHistoryReader historyReader,
            SubscriptionResultSender resultSender
    ) {
        this.subscriptions = Objects.requireNonNull(
                subscriptions,
                "subscriptions");
        this.authorizationService = Objects.requireNonNull(
                authorizationService,
                "authorizationService");
        this.historyReader = Objects.requireNonNull(
                historyReader,
                "historyReader");
        this.resultSender = Objects.requireNonNull(
                resultSender,
                "resultSender");
    }

    public void synchronize(
            String userId,
            String connectionId,
            String roomId,
            RoomSubscriptionSyncRequest request
    ) {
        requireText(userId, "userId");
        requireText(connectionId, "connectionId");
        requireText(roomId, "roomId");
        String requestId =
                request == null ? null : request.requestId();
        if (!validRequestId(requestId)) {
            reject(
                    userId,
                    connectionId,
                    requestId,
                    roomId,
                    RoomSubscriptionSyncErrorCode
                            .INVALID_SYNC_REQUEST,
                    false);
            return;
        }
        if (!requiredRoomSubscriptionsReady(
                connectionId,
                userId,
                roomId)) {
            reject(
                    userId,
                    connectionId,
                    requestId,
                    roomId,
                    RoomSubscriptionSyncErrorCode
                            .ROOM_SUBSCRIPTIONS_NOT_READY,
                    false);
            return;
        }

        RoomAuthorizationDecision authorization =
                authorizationService.authorizeSubscription(
                        userId,
                        roomId);
        if (authorization
                == RoomAuthorizationDecision.FORBIDDEN) {
            reject(
                    userId,
                    connectionId,
                    requestId,
                    roomId,
                    RoomSubscriptionSyncErrorCode
                            .ROOM_SUBSCRIPTION_FORBIDDEN,
                    false);
            return;
        }
        if (authorization
                == RoomAuthorizationDecision.UNAVAILABLE) {
            reject(
                    userId,
                    connectionId,
                    requestId,
                    roomId,
                    RoomSubscriptionSyncErrorCode
                            .ROOM_AUTHORIZATION_UNAVAILABLE,
                    true);
            return;
        }

        try {
            List<ChatMessage> latest =
                    historyReader.findLatest(roomId, 1);
            long watermarkSequence = latest.isEmpty()
                    ? 0
                    : latest.getFirst().roomSequence();
            resultSender.send(
                    userId,
                    connectionId,
                    new RoomSubscriptionsReady(
                            requestId,
                            roomId,
                            watermarkSequence));
        } catch (RuntimeException exception) {
            reject(
                    userId,
                    connectionId,
                    requestId,
                    roomId,
                    RoomSubscriptionSyncErrorCode
                            .ROOM_SUBSCRIPTION_SYNC_UNAVAILABLE,
                    true);
        }
    }

    private boolean requiredRoomSubscriptionsReady(
            String connectionId,
            String userId,
            String roomId
    ) {
        return subscriptions.hasRoomSubscription(
                connectionId,
                userId,
                roomId,
                DestinationKind.TOPIC_ROOM_MESSAGES)
                && subscriptions.hasRoomSubscription(
                connectionId,
                userId,
                roomId,
                DestinationKind.TOPIC_ROOM_EVENTS);
    }

    private void reject(
            String userId,
            String connectionId,
            String requestId,
            String roomId,
            RoomSubscriptionSyncErrorCode code,
            boolean retryable
    ) {
        resultSender.send(
                userId,
                connectionId,
                new RoomSubscriptionSyncRejected(
                        requestId,
                        roomId,
                        code,
                        retryable));
    }

    private static boolean validRequestId(String requestId) {
        if (requestId == null || requestId.isBlank()) {
            return false;
        }
        try {
            return UUID.fromString(requestId)
                    .toString()
                    .equals(requestId);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static void requireText(
            String value,
            String field
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
    }
}
