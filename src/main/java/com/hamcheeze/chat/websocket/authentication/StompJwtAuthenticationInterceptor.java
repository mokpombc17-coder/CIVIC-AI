package com.hamcheeze.chat.websocket.authentication;

import com.hamcheeze.chat.websocket.protocol.StompPolicyException;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public final class StompJwtAuthenticationInterceptor implements ChannelInterceptor {

    private final JwtDecoder jwtDecoder;

    public StompJwtAuthenticationInterceptor(
            org.springframework.beans.factory.ObjectProvider<JwtDecoder> jwtDecoderProvider
    ) {
        this.jwtDecoder = jwtDecoderProvider.getIfAvailable();
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        if (accessor.getCommand() != StompCommand.CONNECT) {
            return message;
        }

        String authorization = first(accessor.getNativeHeader("Authorization"));
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new StompPolicyException("UNAUTHORIZED");
        }
        if (jwtDecoder == null) {
            throw new StompPolicyException("JWT_DECODER_UNAVAILABLE");
        }

        try {
            Jwt jwt = jwtDecoder.decode(authorization.substring(7));
            if (jwt.getSubject() == null || jwt.getSubject().isBlank()) {
                throw new StompPolicyException("UNAUTHORIZED");
            }
            accessor.setUser(new JwtAuthenticationToken(jwt, List.of(), jwt.getSubject()));
            accessor.setLeaveMutable(true);
            return MessageBuilder.createMessage(
                    message.getPayload(), accessor.getMessageHeaders());
        } catch (JwtException exception) {
            throw new StompPolicyException("UNAUTHORIZED", exception);
        }
    }

    private static String first(List<String> values) {
        return values == null || values.isEmpty() ? null : values.getFirst();
    }
}
