package com.hamcheeze.chat.websocket.protocol;

import org.springframework.http.MediaType;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompEncoder;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

import java.nio.charset.StandardCharsets;

public final class AuthenticationRequiredStompFrame {

    public static final String CODE = "AUTHENTICATION_REQUIRED";

    private static final byte[] BODY =
            ("{\"code\":\"AUTHENTICATION_REQUIRED\","
                    + "\"retryable\":false}")
                    .getBytes(StandardCharsets.UTF_8);

    private AuthenticationRequiredStompFrame() {
    }

    public static Message<byte[]> message() {
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.ERROR);
        accessor.setMessage(CODE);
        accessor.setContentType(MediaType.APPLICATION_JSON);
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(
                BODY.clone(),
                accessor.getMessageHeaders());
    }

    public static byte[] encode() {
        Message<byte[]> message = message();
        return new StompEncoder().encode(
                message.getHeaders(),
                message.getPayload());
    }
}
