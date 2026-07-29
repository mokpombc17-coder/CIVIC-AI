package com.hamcheeze.chat.websocket.authentication;

import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.websocket.protocol.StompPolicyException;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.List;

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
        send.setUser(authentication(
                "user-1",
                ChatScopes.MESSAGES_WRITE));

        interceptor.preSend(message(subscribe), null);
        interceptor.preSend(message(send), null);

        verifyNoInteractions(decoder);
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
                new StompJwtAuthenticationInterceptor(null))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("jwtDecoder");
    }

    private static StompJwtAuthenticationInterceptor interceptor(
            JwtDecoder decoder
    ) {
        return new StompJwtAuthenticationInterceptor(decoder);
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
