package com.hamcheeze.chat.websocket.authentication;

import com.hamcheeze.chat.security.CookieOrHeaderBearerTokenResolver;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class WebSocketAuthenticationHandshakeInterceptorTest {

    @Test
    void capturesCookieBearerTokenWithoutAuthenticatingHandshake() {
        WebSocketAuthenticationHandshakeInterceptor interceptor =
                interceptor();
        MockHttpServletRequest servletRequest =
                new MockHttpServletRequest();
        servletRequest.setCookies(new Cookie(
                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                "cookie-token"));
        Map<String, Object> attributes = new HashMap<>();

        boolean accepted = interceptor.beforeHandshake(
                new ServletServerHttpRequest(servletRequest),
                mock(ServerHttpResponse.class),
                mock(WebSocketHandler.class),
                attributes);

        assertThat(accepted).isTrue();
        assertThat(attributes).containsEntry(
                WebSocketAuthenticationHandshakeInterceptor
                        .BEARER_TOKEN_ATTRIBUTE,
                "cookie-token");
        assertThat(attributes).doesNotContainKey(
                WebSocketAuthenticationHandshakeInterceptor
                        .INVALID_BEARER_TOKEN_ATTRIBUTE);
    }

    @Test
    void capturesHttpAuthorizationBearerTokenForStompConnect() {
        WebSocketAuthenticationHandshakeInterceptor interceptor =
                interceptor();
        MockHttpServletRequest servletRequest =
                new MockHttpServletRequest();
        servletRequest.addHeader(
                HttpHeaders.AUTHORIZATION,
                "Bearer header-token");
        Map<String, Object> attributes = new HashMap<>();

        boolean accepted = interceptor.beforeHandshake(
                new ServletServerHttpRequest(servletRequest),
                mock(ServerHttpResponse.class),
                mock(WebSocketHandler.class),
                attributes);

        assertThat(accepted).isTrue();
        assertThat(attributes).containsEntry(
                WebSocketAuthenticationHandshakeInterceptor
                        .BEARER_TOKEN_ATTRIBUTE,
                "header-token");
    }

    @Test
    void leavesMissingTokenForStompConnectFallback() {
        WebSocketAuthenticationHandshakeInterceptor interceptor =
                interceptor();
        Map<String, Object> attributes = new HashMap<>();

        boolean accepted = interceptor.beforeHandshake(
                new ServletServerHttpRequest(
                        new MockHttpServletRequest()),
                mock(ServerHttpResponse.class),
                mock(WebSocketHandler.class),
                attributes);

        assertThat(accepted).isTrue();
        assertThat(attributes).isEmpty();
    }

    @Test
    void defersConflictingHandshakeCredentialsToStompConnect() {
        WebSocketAuthenticationHandshakeInterceptor interceptor =
                interceptor();
        MockHttpServletRequest servletRequest =
                new MockHttpServletRequest();
        servletRequest.addHeader(
                HttpHeaders.AUTHORIZATION,
                "Bearer header-token");
        servletRequest.setCookies(new Cookie(
                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                "cookie-token"));
        Map<String, Object> attributes = new HashMap<>();

        boolean accepted = interceptor.beforeHandshake(
                new ServletServerHttpRequest(servletRequest),
                mock(ServerHttpResponse.class),
                mock(WebSocketHandler.class),
                attributes);

        assertThat(accepted).isTrue();
        assertThat(attributes).containsEntry(
                WebSocketAuthenticationHandshakeInterceptor
                        .INVALID_BEARER_TOKEN_ATTRIBUTE,
                Boolean.TRUE);
        assertThat(attributes).doesNotContainKey(
                WebSocketAuthenticationHandshakeInterceptor
                        .BEARER_TOKEN_ATTRIBUTE);
    }

    private static WebSocketAuthenticationHandshakeInterceptor interceptor() {
        return new WebSocketAuthenticationHandshakeInterceptor(
                new CookieOrHeaderBearerTokenResolver(true));
    }
}
