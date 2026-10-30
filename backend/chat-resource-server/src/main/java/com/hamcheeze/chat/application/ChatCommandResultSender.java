package com.hamcheeze.chat.application;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
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
    private final ActiveConnectionRegistry activeConnections;
    private final Counter rejectedCounter;
    private final Counter failedCounter;

    public ChatCommandResultSender(
            ObjectProvider<SimpMessagingTemplate> messagingTemplate,
            ChatCommandResultMapper mapper,
            ActiveConnectionRegistry activeConnections,
            MeterRegistry meterRegistry
    ) {
        this.messagingTemplate = messagingTemplate;
        this.mapper = mapper;
        this.activeConnections = activeConnections;
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
        if (!activeConnections.isActive(userId, connectionId)) {
            return;
        }
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create();
        headers.setSessionId(connectionId);
        headers.setLeaveMutable(true);
        messagingTemplate.getObject().convertAndSendToUser(
                userId,
                "/queue/command-results",
                mapper.toEnvelope(result),
                headers.getMessageHeaders());
        if (result instanceof ChatCommandRejected) {
            BestEffortMetricRecorder.increment(
                    "chat.command.rejected",
                    rejectedCounter);
        } else if (result instanceof ChatCommandFailed) {
            BestEffortMetricRecorder.increment(
                    "chat.command.failed",
                    failedCounter);
        } else if (result
                instanceof ChatMessageMutationCommandResult mutation) {
            if ("REJECTED".equals(mutation.status())) {
                BestEffortMetricRecorder.increment(
                        "chat.command.rejected",
                        rejectedCounter);
            } else if ("FAILED".equals(mutation.status())) {
                BestEffortMetricRecorder.increment(
                        "chat.command.failed",
                        failedCounter);
            }
        }
    }
}
