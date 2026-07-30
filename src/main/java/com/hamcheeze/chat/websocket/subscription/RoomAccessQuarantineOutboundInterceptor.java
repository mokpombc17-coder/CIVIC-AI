package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.websocket.protocol.DestinationDescriptor;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import com.hamcheeze.chat.websocket.protocol.DestinationPolicy;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
public final class RoomAccessQuarantineOutboundInterceptor
        implements ChannelInterceptor {

    private final DestinationPolicy destinationPolicy;
    private final ChatSubscriptionRegistry subscriptions;

    public RoomAccessQuarantineOutboundInterceptor(
            DestinationPolicy destinationPolicy,
            ChatSubscriptionRegistry subscriptions
    ) {
        this.destinationPolicy = Objects.requireNonNull(
                destinationPolicy,
                "destinationPolicy");
        this.subscriptions = Objects.requireNonNull(
                subscriptions,
                "subscriptions");
    }

    @Override
    public Message<?> preSend(
            Message<?> message,
            MessageChannel channel
    ) {
        if (SimpMessageHeaderAccessor.getMessageType(
                message.getHeaders()) != SimpMessageType.MESSAGE) {
            return message;
        }
        DestinationDescriptor destination = destinationPolicy.classify(
                SimpMessageHeaderAccessor.getDestination(
                        message.getHeaders()));
        if (!roomScoped(destination.kind())) {
            return message;
        }
        String connectionId =
                SimpMessageHeaderAccessor.getSessionId(
                        message.getHeaders());
        String subscriptionId =
                SimpMessageHeaderAccessor.getSubscriptionId(
                        message.getHeaders());
        if (connectionId == null || subscriptionId == null) {
            return null;
        }
        SubscriptionDescriptor descriptor = subscriptions.find(
                        connectionId,
                        subscriptionId)
                .orElse(null);
        if (descriptor == null
                || descriptor.kind() != destination.kind()
                || !Objects.equals(
                descriptor.roomId(),
                destination.roomId())
                || descriptor.roomAccessRevoked()) {
            return null;
        }
        if (destination.kind() == DestinationKind.TOPIC_ROOM_EVENTS) {
            SubscriptionDescriptor messages =
                    subscriptions.findRoomSubscription(
                                    connectionId,
                                    descriptor.userId(),
                                    descriptor.roomId(),
                                    DestinationKind.TOPIC_ROOM_MESSAGES)
                            .orElse(null);
            if (messages == null || messages.roomAccessRevoked()) {
                return null;
            }
        }
        return message;
    }

    private static boolean roomScoped(DestinationKind kind) {
        return kind == DestinationKind.TOPIC_ROOM_MESSAGES
                || kind == DestinationKind.TOPIC_ROOM_EVENTS;
    }
}
