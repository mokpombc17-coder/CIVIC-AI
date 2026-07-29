package com.hamcheeze.chat.websocket.protocol;

import com.hamcheeze.chat.websocket.config.HeartbeatProperties;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

@Component
public final class StompProtocolPolicyInterceptor implements ChannelInterceptor {

    private final DestinationPolicy destinationPolicy;
    private final HeartbeatProperties heartbeatProperties;

    public StompProtocolPolicyInterceptor(
            DestinationPolicy destinationPolicy,
            HeartbeatProperties heartbeatProperties
    ) {
        this.destinationPolicy = destinationPolicy;
        this.heartbeatProperties = heartbeatProperties;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        if (accessor.getMessageType() == SimpMessageType.HEARTBEAT) {
            return message;
        }

        StompCommand command = accessor.getCommand();
        if (command == null) {
            throw new StompPolicyException("UNSUPPORTED_STOMP_COMMAND");
        }

        return switch (command) {
            case CONNECT -> validateConnect(message, accessor);
            case SEND -> validateSend(message, accessor);
            case SUBSCRIBE -> validateSubscribe(message, accessor);
            case UNSUBSCRIBE -> validateUnsubscribe(message, accessor);
            case DISCONNECT -> message;
            case ACK, NACK, BEGIN, COMMIT, ABORT ->
                    throw new StompPolicyException("UNSUPPORTED_STOMP_COMMAND");
            default -> throw new StompPolicyException("UNSUPPORTED_STOMP_COMMAND");
        };
    }

    private Message<?> validateConnect(
            Message<?> message,
            StompHeaderAccessor accessor
    ) {
        if (accessor.getUser() == null) {
            throw new StompPolicyException("UNAUTHORIZED");
        }
        long[] heartbeat = accessor.getHeartbeat();
        if (heartbeat == null || heartbeat.length != 2
                || !between(
                        heartbeat[0],
                        heartbeatProperties.getClientOutgoingMinMs(),
                        heartbeatProperties.getClientOutgoingMaxMs())
                || !between(
                        heartbeat[1],
                        heartbeatProperties.getClientIncomingMinMs(),
                        heartbeatProperties.getClientIncomingMaxMs())) {
            throw new StompPolicyException("INVALID_HEARTBEAT_POLICY");
        }
        return message;
    }

    private Message<?> validateSend(
            Message<?> message,
            StompHeaderAccessor accessor
    ) {
        String destination = accessor.getDestination();
        DestinationKind kind = destinationPolicy
                .classify(destination)
                .kind();
        if (kind != DestinationKind.APP_ROOM_MESSAGES
                && kind
                != DestinationKind.APP_ROOM_SUBSCRIPTION_SYNC) {
            throw new StompPolicyException("INVALID_SEND_DESTINATION");
        }
        return message;
    }

    private static Message<?> validateSubscribe(
            Message<?> message,
            StompHeaderAccessor accessor
    ) {
        if (accessor.getDestination() == null || accessor.getSubscriptionId() == null) {
            throw new StompPolicyException("INVALID_SUBSCRIBE_FRAME");
        }
        String ack = accessor.getAck();
        if (ack != null && !"auto".equals(ack)) {
            throw new StompPolicyException("UNSUPPORTED_ACK_MODE");
        }
        return message;
    }

    private static Message<?> validateUnsubscribe(
            Message<?> message,
            StompHeaderAccessor accessor
    ) {
        if (accessor.getSubscriptionId() == null) {
            throw new StompPolicyException("INVALID_UNSUBSCRIBE_FRAME");
        }
        return message;
    }

    private static boolean between(long value, long min, long max) {
        return value >= min && value <= max;
    }
}
