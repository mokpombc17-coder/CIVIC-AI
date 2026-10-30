package com.hamcheeze.chat.application;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;

import java.security.Principal;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatCommandControllerTest {

    @Test
    void delegatesOnlyToChatCommandService() {
        ChatCommandService service = mock(ChatCommandService.class);
        ChatCommandController controller =
                new ChatCommandController(service);
        Principal principal = () -> "user-1";
        SimpMessageHeaderAccessor headers =
                SimpMessageHeaderAccessor.create();
        headers.setSessionId("connection-1");
        ChatSendCommand command =
                new ChatSendCommand("550e8400-e29b-41d4-a716-446655440000", "hello");

        controller.send("room-1", command, principal, headers);

        verify(service).handle(
                "user-1", "connection-1", "room-1", command);
    }
}
