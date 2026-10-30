package com.hamcheeze.chat.websocket.authentication;

import com.hamcheeze.chat.websocket.protocol.AuthenticationRequiredStompFrame;
import com.hamcheeze.chat.websocket.protocol.StompPolicyException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompDecoder;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketHandlerDecoratorFactory;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.List;

@Component
public final class StompConnectAuthenticationWebSocketHandlerDecoratorFactory
        implements WebSocketHandlerDecoratorFactory {

    private static final Logger log = LoggerFactory.getLogger(
            StompConnectAuthenticationWebSocketHandlerDecoratorFactory.class);
    private static final String PREFLIGHT_COMPLETE_ATTRIBUTE =
            StompConnectAuthenticationWebSocketHandlerDecoratorFactory.class
                    .getName()
                    + ".complete";

    private final StompJwtAuthenticationInterceptor authenticationInterceptor;

    public StompConnectAuthenticationWebSocketHandlerDecoratorFactory(
            StompJwtAuthenticationInterceptor authenticationInterceptor
    ) {
        this.authenticationInterceptor = authenticationInterceptor;
    }

    @Override
    public WebSocketHandler decorate(WebSocketHandler handler) {
        return new WebSocketHandlerDecorator(handler) {
            @Override
            public void handleMessage(
                    WebSocketSession session,
                    WebSocketMessage<?> message
            ) throws Exception {
                if (Boolean.TRUE.equals(session.getAttributes().get(
                        PREFLIGHT_COMPLETE_ATTRIBUTE))) {
                    super.handleMessage(session, message);
                    return;
                }

                StompHeaderAccessor accessor = connectAccessor(message);
                if (accessor == null) {
                    super.handleMessage(session, message);
                    return;
                }

                try {
                    JwtAuthenticationToken authentication =
                            authenticationInterceptor.authenticateConnect(
                                    accessor,
                                    session.getAttributes());
                    session.getAttributes().put(
                            StompJwtAuthenticationInterceptor
                                    .CONNECT_AUTHENTICATION_ATTRIBUTE,
                            authentication);
                    session.getAttributes().put(
                            PREFLIGHT_COMPLETE_ATTRIBUTE,
                            Boolean.TRUE);
                    super.handleMessage(session, message);
                } catch (StompPolicyException exception) {
                    if (!AuthenticationRequiredStompFrame.CODE.equals(
                            exception.code())) {
                        throw exception;
                    }
                    log.info(
                            "STOMP CONNECT authentication rejected: code={}",
                            exception.code());
                    sendAuthenticationRequired(session);
                }
            }
        };
    }

    private static StompHeaderAccessor connectAccessor(
            WebSocketMessage<?> webSocketMessage
    ) {
        ByteBuffer payload;
        if (webSocketMessage instanceof TextMessage textMessage) {
            payload = ByteBuffer.wrap(textMessage.asBytes());
        } else if (webSocketMessage instanceof BinaryMessage binaryMessage) {
            payload = binaryMessage.getPayload().asReadOnlyBuffer();
        } else {
            return null;
        }

        List<Message<byte[]>> messages;
        try {
            messages = new StompDecoder().decode(payload);
        } catch (RuntimeException exception) {
            return null;
        }
        for (Message<byte[]> message : messages) {
            StompHeaderAccessor accessor =
                    MessageHeaderAccessor.getAccessor(
                            message,
                            StompHeaderAccessor.class);
            if (accessor != null
                    && accessor.getCommand() == StompCommand.CONNECT) {
                return accessor;
            }
        }
        return null;
    }

    private static void sendAuthenticationRequired(
            WebSocketSession session
    ) {
        try {
            session.sendMessage(new TextMessage(
                    AuthenticationRequiredStompFrame.encode()));
        } catch (Throwable exception) {
            log.debug(
                    "Failed to send STOMP authentication error",
                    exception);
        } finally {
            try {
                session.close(CloseStatus.PROTOCOL_ERROR);
            } catch (IOException ignored) {
            }
        }
    }
}
