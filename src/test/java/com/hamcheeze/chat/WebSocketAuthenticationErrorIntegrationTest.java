package com.hamcheeze.chat;

import com.hamcheeze.chat.security.CookieOrHeaderBearerTokenResolver;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.websocket.config.FixtureJwtProperties;
import com.hamcheeze.chat.websocket.protocol.ChatStompErrorHandler;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;
import org.springframework.web.socket.messaging.StompSubProtocolHandler;
import org.springframework.web.socket.messaging.SubProtocolWebSocketHandler;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class WebSocketAuthenticationErrorIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private FixtureJwtProperties jwtProperties;

    @Autowired
    private ChatStompErrorHandler stompErrorHandler;

    @Autowired
    private SubProtocolWebSocketHandler webSocketHandler;

    @Test
    void returnsSameStructuredErrorForMissingExpiredAndInvalidCredentials()
            throws Exception {
        assertThat(webSocketHandler.getProtocolHandlers())
                .filteredOn(StompSubProtocolHandler.class::isInstance)
                .singleElement()
                .extracting(handler -> ((StompSubProtocolHandler) handler)
                        .getErrorHandler())
                .isSameAs(stompErrorHandler);
        assertAuthenticationRequired(new WebSocketHttpHeaders());
        assertAuthenticationRequired(cookieHeaders("not-a-jwt"));
        assertAuthenticationRequired(cookieHeaders(token(
                "local-user-1",
                Instant.now().minusSeconds(60))));
        assertAuthenticationRequired(cookieHeaders(token(
                " ",
                Instant.now().plusSeconds(3_600))));
    }

    @Test
    void returnsSameStructuredErrorForInitialAndReconnectAttempts()
            throws Exception {
        WebSocketHttpHeaders expiredCredentials = cookieHeaders(token(
                "local-user-reconnect",
                Instant.now().minusSeconds(60)));

        assertAuthenticationRequired(expiredCredentials);
        assertAuthenticationRequired(expiredCredentials);
    }

    private void assertAuthenticationRequired(
            WebSocketHttpHeaders webSocketHeaders
    ) throws Exception {
        webSocketHeaders.setSecWebSocketProtocol(List.of("v12.stomp"));
        CountDownLatch errorReceived = new CountDownLatch(1);
        AtomicReference<String> errorFrame =
                new AtomicReference<>();
        StandardWebSocketClient client = new StandardWebSocketClient();
        WebSocketSession session = null;
        try {
            session = client.execute(
                            new AbstractWebSocketHandler() {
                        @Override
                        protected void handleTextMessage(
                                WebSocketSession session,
                                TextMessage message
                        ) {
                            errorFrame.set(message.getPayload());
                            errorReceived.countDown();
                        }

                        @Override
                        protected void handleBinaryMessage(
                                WebSocketSession session,
                                BinaryMessage message
                        ) {
                            byte[] payload = new byte[
                                    message.getPayload().remaining()];
                            message.getPayload().get(payload);
                            errorFrame.set(new String(
                                    payload,
                                    StandardCharsets.UTF_8));
                            errorReceived.countDown();
                        }
                    },
                            webSocketHeaders,
                            URI.create("ws://localhost:"
                                    + port
                                    + "/ws"))
                    .get(5, TimeUnit.SECONDS);
            session.sendMessage(new TextMessage(
                    "CONNECT\naccept-version:1.2\n"
                            + "heart-beat:0,0\n\n\0"));

            assertThat(errorReceived.await(5, TimeUnit.SECONDS))
                    .isTrue();
            assertThat(errorFrame.get())
                    .startsWith("ERROR\n")
                    .contains("message:AUTHENTICATION_REQUIRED\n")
                    .contains("content-type:application/json\n")
                    .contains("\n\n{\"code\":"
                            + "\"AUTHENTICATION_REQUIRED\","
                            + "\"retryable\":false}\0");
        } finally {
            if (session != null && session.isOpen()) {
                session.close();
            }
        }
    }

    private static WebSocketHttpHeaders cookieHeaders(String token) {
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add(
                HttpHeaders.COOKIE,
                CookieOrHeaderBearerTokenResolver.COOKIE_NAME
                        + "="
                        + token);
        return headers;
    }

    private String token(
            String subject,
            Instant expirationTime
    ) throws Exception {
        Instant now = Instant.now();
        SignedJWT jwt = new SignedJWT(
                new JWSHeader(JWSAlgorithm.HS256),
                new JWTClaimsSet.Builder()
                        .subject(subject)
                        .issuer(jwtProperties.getIssuer())
                        .audience(List.of(jwtProperties.getAudience()))
                        .claim("scope", "chat:connect")
                        .issueTime(Date.from(now.minusSeconds(120)))
                        .expirationTime(Date.from(expirationTime))
                        .build());
        jwt.sign(new MACSigner(jwtProperties.getSecret()
                .getBytes(StandardCharsets.UTF_8)));
        return jwt.serialize();
    }
}
