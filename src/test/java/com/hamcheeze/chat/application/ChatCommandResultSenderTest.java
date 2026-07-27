package com.hamcheeze.chat.application;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.MessageHeaders;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatCommandResultSenderTest {

    @Test
    void sendsResultToEstablishedCommandResultsDestination() {
        @SuppressWarnings("unchecked")
        ObjectProvider<SimpMessagingTemplate> provider =
                mock(ObjectProvider.class);
        SimpMessagingTemplate messagingTemplate =
                mock(SimpMessagingTemplate.class);
        when(provider.getObject()).thenReturn(messagingTemplate);
        ChatCommandResultSender sender = new ChatCommandResultSender(
                provider,
                new ChatCommandResultMapper(),
                new SimpleMeterRegistry());
        ChatCommandOutcome result = new ChatCommandOutcome(
                "550e8400-e29b-41d4-a716-446655440000",
                ChatCommandOutcomeCode.ACCEPTED,
                "message-1",
                1L);

        sender.send("user-1", "connection-1", result);

        verify(messagingTemplate).convertAndSendToUser(
                eq("user-1"),
                eq("/queue/command-results"),
                eq(new ChatCommandResultEnvelope(
                        "550e8400-e29b-41d4-a716-446655440000",
                        "ACCEPTED",
                        null,
                        false,
                        null,
                        "message-1",
                        1L)),
                any(MessageHeaders.class));
    }
}
