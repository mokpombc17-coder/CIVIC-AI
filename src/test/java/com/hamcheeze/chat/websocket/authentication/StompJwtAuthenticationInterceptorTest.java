package com.hamcheeze.chat.websocket.authentication;

import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import com.hamcheeze.chat.websocket.protocol.DestinationPolicy;
import com.hamcheeze.chat.websocket.protocol.StompPolicyException;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class StompJwtAuthenticationInterceptorTest {

    @Test
    void authenticatesConnectBearerFallbackAndUsesJwtSubjectAsPrincipal() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        when(decoder.decode("valid-token")).thenReturn(Jwt.withTokenValue(
                        "valid-token")
                .header("alg", "none")
                .subject("user-1")
                .claim("scope", ChatScopes.CONNECT)
                .build());
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.addNativeHeader(
                "Authorization", "Bearer valid-token");

        Message<?> result = interceptor.preSend(message(accessor), null);
        StompHeaderAccessor resultAccessor =
                StompHeaderAccessor.wrap(result);

        assertThat(resultAccessor.getUser()).isNotNull();
        assertThat(resultAccessor.getUser().getName()).isEqualTo("user-1");
        verify(decoder).decode("valid-token");
    }

    @Test
    void authenticatesCapturedHandshakeCookieAtStompConnect() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        when(decoder.decode("cookie-token")).thenReturn(Jwt.withTokenValue(
                        "cookie-token")
                .header("alg", "none")
                .subject("user-1")
                .claim("scope", ChatScopes.CONNECT)
                .build());
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);
        Map<String, Object> sessionAttributes = new HashMap<>();
        sessionAttributes.put(
                WebSocketAuthenticationHandshakeInterceptor
                        .BEARER_TOKEN_ATTRIBUTE,
                "cookie-token");
        accessor.setSessionAttributes(sessionAttributes);

        Message<?> result = interceptor.preSend(message(accessor), null);

        assertThat(StompHeaderAccessor.wrap(result).getUser().getName())
                .isEqualTo("user-1");
        assertThat(sessionAttributes).doesNotContainKey(
                WebSocketAuthenticationHandshakeInterceptor
                        .BEARER_TOKEN_ATTRIBUTE);
        verify(decoder).decode("cookie-token");
    }

    @Test
    void rejectsExpiredOrInvalidCapturedTokenAtStompConnect() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        when(decoder.decode("expired-token"))
                .thenThrow(new JwtException("expired"));
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setSessionAttributes(new HashMap<>(Map.of(
                WebSocketAuthenticationHandshakeInterceptor
                        .BEARER_TOKEN_ATTRIBUTE,
                "expired-token")));

        assertThatThrownBy(() ->
                interceptor.preSend(message(accessor), null))
                .isInstanceOf(StompPolicyException.class)
                .extracting(exception ->
                        ((StompPolicyException) exception).code())
                .isEqualTo("AUTHENTICATION_REQUIRED");
        verify(decoder).decode("expired-token");
    }

    @Test
    void rejectsInvalidHandshakeCredentialMarkerAtStompConnect() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setSessionAttributes(new HashMap<>(Map.of(
                WebSocketAuthenticationHandshakeInterceptor
                        .INVALID_BEARER_TOKEN_ATTRIBUTE,
                Boolean.TRUE)));

        assertThatThrownBy(() ->
                interceptor.preSend(message(accessor), null))
                .isInstanceOf(StompPolicyException.class)
                .extracting(exception ->
                        ((StompPolicyException) exception).code())
                .isEqualTo("AUTHENTICATION_REQUIRED");
        verifyNoInteractions(decoder);
    }

    @Test
    void rejectsConnectWithoutHandshakeOrStompCredentials() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);

        assertThatThrownBy(() ->
                interceptor.preSend(message(accessor), null))
                .isInstanceOf(StompPolicyException.class)
                .extracting(exception ->
                        ((StompPolicyException) exception).code())
                .isEqualTo("AUTHENTICATION_REQUIRED");
        verifyNoInteractions(decoder);
    }

    @Test
    void acceptsHandshakePrincipalWithoutConnectAuthorizationHeader() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setUser(authentication(
                "user-1",
                ChatScopes.CONNECT));

        Message<?> result = interceptor.preSend(message(accessor), null);

        assertThat(StompHeaderAccessor.wrap(result).getUser().getName())
                .isEqualTo("user-1");
        verifyNoInteractions(decoder);
    }

    @Test
    void enforcesScopesOnSubscribeAndSendFrames() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor subscribe =
                StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        subscribe.setUser(authentication(
                "user-1",
                ChatScopes.ROOMS_READ));
        StompHeaderAccessor send =
                StompHeaderAccessor.create(StompCommand.SEND);
        send.setDestination(
                "/app/rooms/room-1/messages");
        send.setUser(authentication(
                "user-1",
                ChatScopes.MESSAGES_WRITE));

        interceptor.preSend(message(subscribe), null);
        interceptor.preSend(message(send), null);

        verifyNoInteractions(decoder);
    }

    @Test
    void subscriptionSyncSendRequiresRoomsReadScope() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor sync =
                StompHeaderAccessor.create(StompCommand.SEND);
        sync.setDestination(
                "/app/rooms/room-1/subscriptions/sync");
        sync.setUser(authentication(
                "user-1",
                ChatScopes.ROOMS_READ));

        interceptor.preSend(message(sync), null);

        sync.setUser(authentication(
                "user-1",
                ChatScopes.MESSAGES_WRITE));
        assertThatThrownBy(() ->
                interceptor.preSend(message(sync), null))
                .isInstanceOf(StompPolicyException.class)
                .extracting(exception ->
                        ((StompPolicyException) exception).code())
                .isEqualTo("FORBIDDEN");
    }

    @Test
    void rejectsAuthenticatedPrincipalWithoutRequiredScope() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setUser(authentication(
                "user-1",
                ChatScopes.ROOMS_READ));

        assertThatThrownBy(() ->
                interceptor.preSend(message(accessor), null))
                .isInstanceOf(StompPolicyException.class)
                .extracting(exception ->
                        ((StompPolicyException) exception).code())
                .isEqualTo("FORBIDDEN");
    }

    @Test
    void ignoresFramesWithoutAuthenticationPolicy() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.DISCONNECT);

        interceptor.preSend(message(accessor), null);

        verifyNoInteractions(decoder);
    }

    @Test
    void requiresJwtDecoderAtConstructionTime() {
        assertThatThrownBy(() ->
                new StompJwtAuthenticationInterceptor(
                        null,
                        destinationPolicy()))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("jwtDecoder");
    }

    private static StompJwtAuthenticationInterceptor interceptor(
            JwtDecoder decoder
    ) {
        return new StompJwtAuthenticationInterceptor(
                decoder,
                destinationPolicy());
    }

    private static DestinationPolicy destinationPolicy() {
        return new DestinationPolicy(
                new ChatContentProperties());
    }

    private static JwtAuthenticationToken authentication(
            String subject,
            String... scopes
    ) {
        Jwt jwt = Jwt.withTokenValue("handshake-token")
                .header("alg", "none")
                .subject(subject)
                .claim("scope", String.join(" ", scopes))
                .build();
        List<SimpleGrantedAuthority> authorities =
                java.util.Arrays.stream(scopes)
                        .map(ChatScopes::authority)
                        .map(SimpleGrantedAuthority::new)
                        .toList();
        return new JwtAuthenticationToken(
                jwt,
                authorities,
                subject);
    }

    private static Message<byte[]> message(
            StompHeaderAccessor accessor
    ) {
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(
                new byte[0], accessor.getMessageHeaders());
    }
}
