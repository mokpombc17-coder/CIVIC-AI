package com.hamcheeze.chat.websocket.subscription;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
public final class SubscriptionResultSender {

    private static final Logger log =
            LoggerFactory.getLogger(SubscriptionResultSender.class);

    private final ObjectProvider<SimpMessagingTemplate> messagingTemplate;

    public SubscriptionResultSender(
            ObjectProvider<SimpMessagingTemplate> messagingTemplate
    ) {
        this.messagingTemplate = messagingTemplate;
    }

    public void send(
            String userId,
            String connectionId,
            SubscriptionRejected result
    ) {
        try {
            SimpMessageHeaderAccessor headers =
                    SimpMessageHeaderAccessor.create();
            headers.setSessionId(connectionId);
            headers.setLeaveMutable(true);
            messagingTemplate.getObject().convertAndSendToUser(
                    userId,
                    "/queue/system-events",
                    result,
                    headers.getMessageHeaders());
        } catch (RuntimeException exception) {
            log.warn(
                    "Failed to send subscription rejection: userId={}, connectionId={}, code={}",
                    userId, connectionId, result.code(), exception);
        }
    }
}
