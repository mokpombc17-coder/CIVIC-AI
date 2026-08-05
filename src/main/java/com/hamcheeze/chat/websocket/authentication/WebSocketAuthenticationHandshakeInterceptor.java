package com.hamcheeze.chat.websocket.authentication;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;
import java.util.Objects;

@Component
public final class WebSocketAuthenticationHandshakeInterceptor
        implements HandshakeInterceptor {

    static final String BEARER_TOKEN_ATTRIBUTE =
            WebSocketAuthenticationHandshakeInterceptor.class.getName()
                    + ".bearerToken";
    static final String INVALID_BEARER_TOKEN_ATTRIBUTE =
            WebSocketAuthenticationHandshakeInterceptor.class.getName()
                    + ".invalidBearerToken";

    private final BearerTokenResolver bearerTokenResolver;

    public WebSocketAuthenticationHandshakeInterceptor(
            BearerTokenResolver bearerTokenResolver
    ) {
        this.bearerTokenResolver = Objects.requireNonNull(
                bearerTokenResolver,
                "bearerTokenResolver");
    }

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes
    ) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            return true;
        }

        HttpServletRequest httpRequest = servletRequest.getServletRequest();
        try {
            String token = bearerTokenResolver.resolve(httpRequest);
            if (token != null) {
                attributes.put(BEARER_TOKEN_ATTRIBUTE, token);
            }
        } catch (OAuth2AuthenticationException exception) {
            attributes.put(INVALID_BEARER_TOKEN_ATTRIBUTE, Boolean.TRUE);
        }
        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Exception exception
    ) {
    }
}
