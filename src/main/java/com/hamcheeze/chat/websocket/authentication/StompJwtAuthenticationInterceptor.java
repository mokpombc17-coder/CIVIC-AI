package com.hamcheeze.chat.websocket.authentication;

import com.hamcheeze.chat.security.ChatScopes;
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
import java.util.Objects;

@Component
public final class StompJwtAuthenticationInterceptor implements ChannelInterceptor {

    private final JwtDecoder jwtDecoder;
    private final JwtAuthenticationConverter authenticationConverter =
            new JwtAuthenticationConverter();

    public StompJwtAuthenticationInterceptor(
            JwtDecoder jwtDecoder
    ) {
        this.jwtDecoder = Objects.requireNonNull(
                jwtDecoder,
                "jwtDecoder");
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

        if (command == StompCommand.CONNECT && accessor.getUser() == null) {
            authenticateBearerFallback(accessor);
        }

        if (command == StompCommand.CONNECT) {
            requireScope(accessor.getUser(), ChatScopes.CONNECT);
        } else if (command == StompCommand.SUBSCRIBE) {
            requireScope(accessor.getUser(), ChatScopes.ROOMS_READ);
        } else if (command == StompCommand.SEND) {
            requireScope(accessor.getUser(), ChatScopes.MESSAGES_WRITE);
        }
        return message;
    }

    private void authenticateBearerFallback(
            StompHeaderAccessor accessor
    ) {
        String authorization = first(
                accessor.getNativeHeader("Authorization"));
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new StompPolicyException("UNAUTHORIZED");
        }
        try {
            Jwt jwt = jwtDecoder.decode(authorization.substring(7));
            if (jwt.getSubject() == null || jwt.getSubject().isBlank()) {
                throw new StompPolicyException("UNAUTHORIZED");
            }
            JwtAuthenticationToken authentication =
                    (JwtAuthenticationToken)
                            authenticationConverter.convert(jwt);
            accessor.setUser(authentication);
        } catch (JwtException exception) {
            throw new StompPolicyException("UNAUTHORIZED", exception);
        }
    }

    private static void requireScope(
            Principal principal,
            String scope
    ) {
        if (!(principal instanceof JwtAuthenticationToken authentication)
                || !authentication.isAuthenticated()) {
            throw new StompPolicyException("UNAUTHORIZED");
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
}
