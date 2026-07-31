package com.hamcheeze.chat.application;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public final class ChatCommandController {

    private final ChatCommandService chatCommandService;

    public ChatCommandController(ChatCommandService chatCommandService) {
        this.chatCommandService = chatCommandService;
    }

    @MessageMapping("/rooms/{roomId}/messages")
    public void send(
            @DestinationVariable String roomId,
            ChatSendCommand command,
            Principal principal,
            SimpMessageHeaderAccessor headers
    ) {
        chatCommandService.handle(
                principal.getName(),
                headers.getSessionId(),
                roomId,
                command);
    }

    @MessageMapping("/rooms/{roomId}/messages/edit")
    public void edit(
            @DestinationVariable String roomId,
            ChatEditCommand command,
            Principal principal,
            SimpMessageHeaderAccessor headers
    ) {
        chatCommandService.handleEdit(
                principal.getName(),
                headers.getSessionId(),
                roomId,
                command);
    }

    @MessageMapping("/rooms/{roomId}/messages/delete")
    public void delete(
            @DestinationVariable String roomId,
            ChatDeleteCommand command,
            Principal principal,
            SimpMessageHeaderAccessor headers
    ) {
        chatCommandService.handleDelete(
                principal.getName(),
                headers.getSessionId(),
                roomId,
                command);
    }
}
