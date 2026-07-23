package com.hamcheeze.chat.application;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
public final class ChatCommandResultSender {

    private final ObjectProvider<SimpMessagingTemplate> messagingTemplate;
    private final ChatCommandResultMapper mapper;
    private final Counter rejectedCounter;
    private final Counter failedCounter;

    public ChatCommandResultSender(
            ObjectProvider<SimpMessagingTemplate> messagingTemplate,
            ChatCommandResultMapper mapper,
            MeterRegistry meterRegistry
    ) {
        this.messagingTemplate = messagingTemplate;
        this.mapper = mapper;
        this.rejectedCounter =
                meterRegistry.counter("chat.command.rejected");
        this.failedCounter =
                meterRegistry.counter("chat.command.failed");
    }

    public void send(
            String userId,
            String connectionId,
            ChatCommandResult result
    ) {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create();
        headers.setSessionId(connectionId);
        headers.setLeaveMutable(true);
        messagingTemplate.getObject().convertAndSendToUser(
                userId,
                "/queue/command-results",
                mapper.toEnvelope(result),
                headers.getMessageHeaders());
        if (result instanceof ChatCommandRejected) {
            rejectedCounter.increment();
        } else if (result instanceof ChatCommandFailed) {
            failedCounter.increment();
        }
    }
}
