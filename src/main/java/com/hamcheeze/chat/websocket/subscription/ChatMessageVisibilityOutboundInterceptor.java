package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.delivery.ChatMessageBrokerHeaders;
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
public final class ChatMessageVisibilityOutboundInterceptor
        implements ChannelInterceptor {

    private final DestinationPolicy destinationPolicy;
    private final ChatSubscriptionRegistry subscriptions;

    public ChatMessageVisibilityOutboundInterceptor(
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
        String destination =
                SimpMessageHeaderAccessor.getDestination(
                        message.getHeaders());
        DestinationDescriptor destinationDescriptor =
                destinationPolicy.classify(destination);
        if (destinationDescriptor.kind()
                != DestinationKind.TOPIC_ROOM_MESSAGES) {
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
        SubscriptionDescriptor subscription = subscriptions.find(
                        connectionId,
                        subscriptionId)
                .orElse(null);
        if (subscription == null
                || subscription.kind()
                != DestinationKind.TOPIC_ROOM_MESSAGES
                || !Objects.equals(
                subscription.roomId(),
                destinationDescriptor.roomId())
                || subscription.messageVisibleAfterSequence() == null) {
            return null;
        }
        Object sequenceHeader = message.getHeaders().get(
                ChatMessageBrokerHeaders.ROOM_SEQUENCE);
        if (!(sequenceHeader instanceof Long roomSequence)
                || roomSequence < 1) {
            return null;
        }
        return roomSequence
                > subscription.messageVisibleAfterSequence()
                ? message
                : null;
    }
}
