package com.hamcheeze.chat.websocket.authentication;

import com.hamcheeze.chat.websocket.protocol.StompPolicyException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class StompJwtAuthenticationInterceptorTest {

    @Test
    void authenticatesOnlyConnectAndUsesJwtSubjectAsPrincipal() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        when(decoder.decode("valid-token")).thenReturn(Jwt.withTokenValue(
                        "valid-token")
                .header("alg", "none")
                .subject("user-1")
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
    void doesNotAuthenticateNonConnectFrames() {
        JwtDecoder decoder = mock(JwtDecoder.class);
        StompJwtAuthenticationInterceptor interceptor =
                interceptor(decoder);
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.SEND);

        interceptor.preSend(message(accessor), null);

        verifyNoInteractions(decoder);
    }

    @Test
    void failsClosedWhenDecoderIsUnavailable() {
        @SuppressWarnings("unchecked")
        ObjectProvider<JwtDecoder> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(null);
        StompJwtAuthenticationInterceptor interceptor =
                new StompJwtAuthenticationInterceptor(provider);
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.addNativeHeader("Authorization", "Bearer token");

        assertThatThrownBy(() ->
                interceptor.preSend(message(accessor), null))
                .isInstanceOf(StompPolicyException.class)
                .hasMessage("JWT_DECODER_UNAVAILABLE");
    }

    private static StompJwtAuthenticationInterceptor interceptor(
            JwtDecoder decoder
    ) {
        @SuppressWarnings("unchecked")
        ObjectProvider<JwtDecoder> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(decoder);
        return new StompJwtAuthenticationInterceptor(provider);
    }

    private static Message<byte[]> message(
            StompHeaderAccessor accessor
    ) {
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(
                new byte[0], accessor.getMessageHeaders());
    }
}
