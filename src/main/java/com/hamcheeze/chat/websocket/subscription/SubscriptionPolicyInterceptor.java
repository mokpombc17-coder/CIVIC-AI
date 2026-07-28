package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.websocket.protocol.DestinationDescriptor;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import com.hamcheeze.chat.websocket.protocol.DestinationPolicy;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.EnumMap;
import java.util.Map;

@Component
public final class SubscriptionPolicyInterceptor
        implements ChannelInterceptor {

    private static final Logger log =
            LoggerFactory.getLogger(SubscriptionPolicyInterceptor.class);

    private final DestinationPolicy destinationPolicy;
    private final RoomAuthorizationService roomAuthorizationService;
    private final ChatSubscriptionRegistry subscriptions;
    private final SubscriptionResultSender resultSender;
    private final Map<SubscriptionRejectedCode, Counter> rejectedCounters;

    public SubscriptionPolicyInterceptor(
            DestinationPolicy destinationPolicy,
            RoomAuthorizationService roomAuthorizationService,
            ChatSubscriptionRegistry subscriptions,
            SubscriptionResultSender resultSender,
            MeterRegistry meterRegistry
    ) {
        this.destinationPolicy = destinationPolicy;
        this.roomAuthorizationService = roomAuthorizationService;
        this.subscriptions = subscriptions;
        this.resultSender = resultSender;
        this.rejectedCounters = new EnumMap<>(SubscriptionRejectedCode.class);
        for (SubscriptionRejectedCode code : SubscriptionRejectedCode.values()) {
            rejectedCounters.put(
                    code,
                    Counter.builder("stomp.subscriptions.rejected")
                            .tag("code", code.name())
                            .register(meterRegistry));
        }
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        if (accessor.getCommand() == StompCommand.SUBSCRIBE) {
            return subscribe(message, accessor);
        }
        if (accessor.getCommand() == StompCommand.UNSUBSCRIBE) {
            subscriptions.remove(
                    accessor.getSessionId(), accessor.getSubscriptionId());
        }
        return message;
    }

    private Message<?> subscribe(
            Message<?> message,
            StompHeaderAccessor accessor
    ) {
        Principal principal = accessor.getUser();
        String userId = principal == null ? null : principal.getName();
        String connectionId = accessor.getSessionId();
        String destination = accessor.getDestination();
        DestinationDescriptor descriptor = destinationPolicy.classify(destination);

        if (!allowedSubscribeKind(descriptor.kind())) {
            SubscriptionRejectedCode code =
                    descriptor.kind() == DestinationKind.TOPIC_READ_RECEIPTS_DISABLED
                            ? SubscriptionRejectedCode.DESTINATION_DISABLED
                            : SubscriptionRejectedCode.INVALID_DESTINATION;
            reject(userId, connectionId, destination, code);
            return null;
        }

        if (descriptor.roomScoped()) {
            RoomAuthorizationDecision decision =
                    roomAuthorizationService.authorizeSubscription(
                            userId, descriptor.roomId());
            if (decision == RoomAuthorizationDecision.FORBIDDEN) {
                reject(
                        userId, connectionId, destination,
                        SubscriptionRejectedCode.ROOM_SUBSCRIPTION_FORBIDDEN);
                return null;
            }
            if (decision == RoomAuthorizationDecision.UNAVAILABLE) {
                reject(
                        userId, connectionId, destination,
                        SubscriptionRejectedCode.ROOM_AUTHORIZATION_UNAVAILABLE);
                return null;
            }
        }

        SubscriptionRegistrationResult registration = subscriptions.register(
                connectionId,
                new SubscriptionDescriptor(
                        accessor.getSubscriptionId(),
                        userId,
                        destination,
                        descriptor.kind(),
                        descriptor.roomId()));
        if (!registration.registered()) {
            reject(
                    userId, connectionId, destination,
                    registration.rejectionCode());
            return null;
        }
        if (descriptor.roomScoped()) {
            RoomAuthorizationDecision decision =
                    roomAuthorizationService.authorizeSubscription(
                            userId,
                            descriptor.roomId());
            if (decision != RoomAuthorizationDecision.ALLOWED) {
                subscriptions.remove(
                        connectionId,
                        accessor.getSubscriptionId());
                reject(
                        userId,
                        connectionId,
                        destination,
                        decision == RoomAuthorizationDecision.FORBIDDEN
                                ? SubscriptionRejectedCode
                                .ROOM_SUBSCRIPTION_FORBIDDEN
                                : SubscriptionRejectedCode
                                .ROOM_AUTHORIZATION_UNAVAILABLE);
                return null;
            }
        }
        return message;
    }

    private void reject(
            String userId,
            String connectionId,
            String destination,
            SubscriptionRejectedCode code
    ) {
        BestEffortMetricRecorder.increment(
                "stomp.subscriptions.rejected",
                rejectedCounters.get(code));
        log.info(
                "STOMP subscription rejected: userId={}, connectionId={}, destination={}, code={}",
                userId, connectionId, destination, code);
        if (userId != null && connectionId != null) {
            resultSender.send(
                    userId,
                    connectionId,
                    new SubscriptionRejected(code, destination));
        }
    }

    private static boolean allowedSubscribeKind(DestinationKind kind) {
        return kind == DestinationKind.TOPIC_ROOM_MESSAGES
                || kind == DestinationKind.TOPIC_ROOM_EVENTS
                || kind == DestinationKind.USER_COMMAND_RESULTS
                || kind == DestinationKind.USER_SYSTEM_EVENTS;
    }
}
