package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.query.ChatMessageHistoryReader;
import com.hamcheeze.chat.room.authorization.RoomMessageAccess;
import com.hamcheeze.chat.room.authorization.RoomMessageAccessResolver;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public final class RoomSubscriptionSyncService {

    private final ChatSubscriptionRegistry subscriptions;
    private final RoomMessageAccessResolver messageAccessResolver;
    private final ChatMessageHistoryReader historyReader;
    private final SubscriptionResultSender resultSender;

    public RoomSubscriptionSyncService(
            ChatSubscriptionRegistry subscriptions,
            RoomMessageAccessResolver messageAccessResolver,
            ChatMessageHistoryReader historyReader,
            SubscriptionResultSender resultSender
    ) {
        this.subscriptions = Objects.requireNonNull(
                subscriptions,
                "subscriptions");
        this.messageAccessResolver = Objects.requireNonNull(
                messageAccessResolver,
                "messageAccessResolver");
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
        Optional<SubscriptionDescriptor> messages =
                subscriptions.findRoomSubscription(
                        connectionId,
                        userId,
                        roomId,
                        DestinationKind.TOPIC_ROOM_MESSAGES);
        Optional<SubscriptionDescriptor> events =
                subscriptions.findRoomSubscription(
                        connectionId,
                        userId,
                        roomId,
                        DestinationKind.TOPIC_ROOM_EVENTS);
        Optional<SubscriptionDescriptor> readReceipts =
                subscriptions.findRoomSubscription(
                        connectionId,
                        userId,
                        roomId,
                        DestinationKind.TOPIC_ROOM_READ_RECEIPTS);
        if (messages.isEmpty()
                || events.isEmpty()
                || readReceipts.isEmpty()) {
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

        RoomMessageAccess messageAccess =
                messageAccessResolver.resolve(userId, roomId);
        if (messageAccess.decision()
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
        if (messageAccess.decision()
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

        if (messages.get().roomAccessRevoked()
                || events.get().roomAccessRevoked()
                || readReceipts.get().roomAccessRevoked()
                || !matches(messages.get(), messageAccess)
                || !matches(events.get(), messageAccess)
                || !matches(readReceipts.get(), messageAccess)) {
            reject(
                    userId,
                    connectionId,
                    requestId,
                    roomId,
                    RoomSubscriptionSyncErrorCode
                            .ROOM_SUBSCRIPTION_STALE,
                    false);
            return;
        }

        try {
            List<ChatMessage> latest =
                    historyReader.findLatest(roomId, 0, 1);
            long watermarkSequence = latest.isEmpty()
                    ? 0
                    : latest.getFirst().roomSequence();
            resultSender.send(
                    userId,
                    connectionId,
                    new RoomSubscriptionsReady(
                            requestId,
                            roomId,
                            messageAccess
                                    .messageVisibleAfterSequence(),
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

    private static boolean matches(
            SubscriptionDescriptor descriptor,
            RoomMessageAccess access
    ) {
        return Objects.equals(
                descriptor.membershipId(), access.membershipId())
                && Objects.equals(
                descriptor.membershipVersion(),
                access.membershipVersion())
                && Objects.equals(
                descriptor.messageVisibleAfterSequence(),
                access.messageVisibleAfterSequence());
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
