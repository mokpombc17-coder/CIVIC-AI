package com.hamcheeze.chat.websocket.authentication;

import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import com.hamcheeze.chat.websocket.protocol.DestinationPolicy;
import com.hamcheeze.chat.websocket.protocol.AuthenticationRequiredStompFrame;
import com.hamcheeze.chat.websocket.protocol.StompPolicyException;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Component
public final class StompJwtAuthenticationInterceptor implements ChannelInterceptor {

    static final String CONNECT_AUTHENTICATION_ATTRIBUTE =
            StompJwtAuthenticationInterceptor.class.getName()
                    + ".connectAuthentication";

    private final JwtDecoder jwtDecoder;
    private final DestinationPolicy destinationPolicy;
    private final JwtAuthenticationConverter authenticationConverter =
            new JwtAuthenticationConverter();

    public StompJwtAuthenticationInterceptor(
            JwtDecoder jwtDecoder,
            DestinationPolicy destinationPolicy
    ) {
        this.jwtDecoder = Objects.requireNonNull(
                jwtDecoder,
                "jwtDecoder");
        this.destinationPolicy = Objects.requireNonNull(
                destinationPolicy,
                "destinationPolicy");
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(
                        message,
                        StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }
        StompCommand command = accessor.getCommand();
        if (command == null) {
            return message;
        }

        if (command == StompCommand.CONNECT) {
            if (accessor.getUser() == null) {
                accessor.setUser(consumeConnectAuthentication(accessor));
            } else {
                clearHandshakeAuthentication(accessor);
            }
            requireScope(accessor.getUser(), ChatScopes.CONNECT);
        } else if (command == StompCommand.SUBSCRIBE) {
            requireScope(accessor.getUser(), ChatScopes.ROOMS_READ);
        } else if (command == StompCommand.SEND) {
            requireScope(
                    accessor.getUser(),
                    sendScope(accessor.getDestination()));
        }
        return message;
    }

    private String sendScope(String destination) {
        DestinationKind kind =
                destinationPolicy.classify(destination).kind();
        if (kind
                == DestinationKind.APP_ROOM_SUBSCRIPTION_SYNC) {
            return ChatScopes.ROOMS_READ;
        }
        return ChatScopes.MESSAGES_WRITE;
    }

    JwtAuthenticationToken authenticateConnect(
            StompHeaderAccessor accessor,
            Map<String, Object> sessionAttributes
    ) {
        String token = consumeHandshakeBearerToken(sessionAttributes);
        if (token == null) {
            String authorization = first(
                accessor.getNativeHeader("Authorization"));
            if (authorization == null
                    || !authorization.startsWith("Bearer ")) {
                throw authenticationRequired();
            }
            token = authorization.substring(7);
        }
        if (token.isBlank()) {
            throw authenticationRequired();
        }
        try {
            Jwt jwt = jwtDecoder.decode(token);
            if (jwt.getSubject() == null || jwt.getSubject().isBlank()) {
                throw authenticationRequired();
            }
            JwtAuthenticationToken authentication =
                    (JwtAuthenticationToken)
                            authenticationConverter.convert(jwt);
            return authentication;
        } catch (JwtException exception) {
            throw new StompPolicyException(
                    AuthenticationRequiredStompFrame.CODE,
                    exception);
        }
    }

    private static String consumeHandshakeBearerToken(
            Map<String, Object> attributes
    ) {
        if (attributes == null) {
            return null;
        }
        Object invalid = attributes.remove(
                WebSocketAuthenticationHandshakeInterceptor
                        .INVALID_BEARER_TOKEN_ATTRIBUTE);
        Object token = attributes.remove(
                WebSocketAuthenticationHandshakeInterceptor
                        .BEARER_TOKEN_ATTRIBUTE);
        if (Boolean.TRUE.equals(invalid)) {
            throw authenticationRequired();
        }
        return token instanceof String value ? value : null;
    }

    private JwtAuthenticationToken consumeConnectAuthentication(
            StompHeaderAccessor accessor
    ) {
        Map<String, Object> attributes = accessor.getSessionAttributes();
        if (attributes != null) {
            Object authentication = attributes.remove(
                    CONNECT_AUTHENTICATION_ATTRIBUTE);
            if (authentication instanceof JwtAuthenticationToken token) {
                return token;
            }
        }
        return authenticateConnect(accessor, attributes);
    }

    private static void clearHandshakeAuthentication(
            StompHeaderAccessor accessor
    ) {
        Map<String, Object> attributes = accessor.getSessionAttributes();
        if (attributes == null) {
            return;
        }
        attributes.remove(
                WebSocketAuthenticationHandshakeInterceptor
                        .INVALID_BEARER_TOKEN_ATTRIBUTE);
        attributes.remove(
                WebSocketAuthenticationHandshakeInterceptor
                        .BEARER_TOKEN_ATTRIBUTE);
    }

    private static void requireScope(
            Principal principal,
            String scope
    ) {
        if (!(principal instanceof JwtAuthenticationToken authentication)
                || !authentication.isAuthenticated()) {
            throw authenticationRequired();
        }
        String requiredAuthority = ChatScopes.authority(scope);
        boolean granted = authentication.getAuthorities().stream()
                .anyMatch(authority ->
                        requiredAuthority.equals(authority.getAuthority()));
        if (!granted) {
            throw new StompPolicyException("FORBIDDEN");
        }
    }

    private static String first(List<String> values) {
        return values == null || values.isEmpty() ? null : values.getFirst();
    }

    private static StompPolicyException authenticationRequired() {
        return new StompPolicyException(
                AuthenticationRequiredStompFrame.CODE);
    }
}
