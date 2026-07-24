package com.hamcheeze.chat;

import com.hamcheeze.chat.application.ChatCommandResultEnvelope;
import com.hamcheeze.chat.application.ChatSendCommand;
import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.config.TemporaryJwtProperties;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "chat.message-pipeline.mode=in-memory")
@ActiveProfiles("limit-test")
class ChatMessagePipelineWebSocketIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private TemporaryJwtProperties jwtProperties;

    @Autowired
    private ActiveConnectionRegistry activeConnections;

    @Test
    void authenticatesStoresPublishesAndReturnsFinalResults()
            throws Exception {
        ThreadPoolTaskScheduler scheduler =
                new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("stomp-test-");
        scheduler.initialize();

        WebSocketStompClient client = new WebSocketStompClient(
                new StandardWebSocketClient());
        client.setMessageConverter(
                new JacksonJsonMessageConverter());
        client.setTaskScheduler(scheduler);
        client.start();

        StompSession session = null;
        try {
            AtomicReference<Throwable> transportFailure =
                    new AtomicReference<>();
            AtomicReference<String> errorFrame =
                    new AtomicReference<>();
            StompHeaders connectHeaders = new StompHeaders();
            connectHeaders.set(
                    "Authorization",
                    "Bearer " + token("local-user-1"));
            connectHeaders.setHeartbeat(
                    new long[]{10_000, 10_000});

            session = client.connectAsync(
                            "ws://localhost:" + port + "/ws",
                            new WebSocketHttpHeaders(),
                            connectHeaders,
                            new StompSessionHandlerAdapter() {
                                @Override
                                public Type getPayloadType(
                                        StompHeaders headers
                                ) {
                                    return byte[].class;
                                }

                                @Override
                                public void handleFrame(
                                        StompHeaders headers,
                                        Object payload
                                ) {
                                    String body = payload == null
                                            ? ""
                                            : new String(
                                                    (byte[]) payload,
                                                    StandardCharsets.UTF_8);
                                    errorFrame.set(
                                            headers + " body=" + body);
                                }

                                @Override
                                public void handleException(
                                        StompSession session,
                                        StompCommand command,
                                        StompHeaders headers,
                                        byte[] payload,
                                        Throwable exception
                                ) {
                                    transportFailure.compareAndSet(
                                            null, exception);
                                }

                                @Override
                                public void handleTransportError(
                                        StompSession session,
                                        Throwable exception
                                ) {
                                    transportFailure.compareAndSet(
                                            null, exception);
                                }
                            })
                    .get(5, TimeUnit.SECONDS);
            assertThat(activeConnections.activeCount()).isEqualTo(1);
            BlockingQueue<ChatMessageEventEnvelope> roomMessages =
                    new LinkedBlockingQueue<>();
            BlockingQueue<ChatCommandResultEnvelope> commandResults =
                    new LinkedBlockingQueue<>();

            session.subscribe(
                    "/topic/rooms/test-room/messages",
                    collectingHandler(
                            ChatMessageEventEnvelope.class,
                            roomMessages));
            assertConnectionOpen(
                    session,
                    transportFailure,
                    errorFrame,
                    "room subscription");
            session.subscribe(
                    "/user/queue/command-results",
                    collectingHandler(
                            ChatCommandResultEnvelope.class,
                            commandResults));
            assertConnectionOpen(
                    session,
                    transportFailure,
                    errorFrame,
                    "result subscription");

            session.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand("client-1", "  hello  "));

            ChatMessageEventEnvelope roomMessage =
                    roomMessages.poll(5, TimeUnit.SECONDS);
            ChatCommandResultEnvelope accepted =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(roomMessage).isNotNull();
            assertThat(roomMessage.eventVersion()).isEqualTo(1);
            assertThat(roomMessage.eventType())
                    .isEqualTo("CHAT_MESSAGE_CREATED");
            assertThat(roomMessage.payload().content())
                    .isEqualTo("hello");
            assertThat(roomMessage.payload().roomSequence())
                    .isEqualTo(1);
            assertThat(accepted).isNotNull();
            assertThat(accepted.status()).isEqualTo("ACCEPTED");
            assertThat(accepted.messageId())
                    .isEqualTo(roomMessage.payload().messageId());
            assertThat(accepted.roomSequence()).isEqualTo(1);

            session.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand("client-1", "hello"));
            ChatCommandResultEnvelope duplicate =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(duplicate).isNotNull();
            assertThat(duplicate.status()).isEqualTo("DUPLICATE");
            assertThat(duplicate.messageId())
                    .isEqualTo(accepted.messageId());

            session.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand("client-1", "changed"));
            ChatCommandResultEnvelope conflict =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(conflict).isNotNull();
            assertThat(conflict.status()).isEqualTo("REJECTED");
            assertThat(conflict.code())
                    .isEqualTo("IDEMPOTENCY_CONFLICT");
            assertThat(conflict.retryable()).isFalse();
            assertThat(roomMessages.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();
        } finally {
            if (session != null && session.isConnected()) {
                session.disconnect();
            }
            client.stop();
            scheduler.shutdown();
        }
    }

    private <T> StompFrameHandler collectingHandler(
            Class<T> payloadType,
            BlockingQueue<T> messages
    ) {
        return new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return payloadType;
            }

            @Override
            public void handleFrame(
                    StompHeaders headers,
                    Object payload
            ) {
                messages.add(payloadType.cast(payload));
            }
        };
    }

    private void assertConnectionOpen(
            StompSession session,
            AtomicReference<Throwable> transportFailure,
            AtomicReference<String> errorFrame,
            String stage
    ) throws InterruptedException {
        Thread.sleep(100);
        assertThat(session.isConnected())
                .withFailMessage(
                        "STOMP connection closed after %s: failure=%s, errorFrame=%s",
                        stage,
                        transportFailure.get(),
                        errorFrame.get())
                .isTrue();
    }

    private String token(String subject) throws Exception {
        Instant now = Instant.now();
        SignedJWT jwt = new SignedJWT(
                new JWSHeader(JWSAlgorithm.HS256),
                new JWTClaimsSet.Builder()
                        .subject(subject)
                        .issuer(jwtProperties.getIssuer())
                        .audience(List.of(
                                jwtProperties.getAudience()))
                        .issueTime(Date.from(now.minusSeconds(1)))
                        .expirationTime(Date.from(
                                now.plusSeconds(3_600)))
                        .build());
        jwt.sign(new MACSigner(jwtProperties.getSecret()
                .getBytes(StandardCharsets.UTF_8)));
        return jwt.serialize();
    }
}
