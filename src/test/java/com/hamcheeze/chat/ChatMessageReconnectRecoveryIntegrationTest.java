package com.hamcheeze.chat;

import com.hamcheeze.chat.application.ChatCommandResult;
import com.hamcheeze.chat.application.ChatCommandResultEnvelope;
import com.hamcheeze.chat.application.ChatCommandResultSender;
import com.hamcheeze.chat.application.ChatSendCommand;
import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.message.inmemory.InMemoryChatMessageStore;
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
import org.springframework.messaging.converter.ByteArrayMessageConverter;
import org.springframework.messaging.converter.CompositeMessageConverter;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "chat.message-pipeline.mode=in-memory")
@ActiveProfiles("limit-test")
class ChatMessageReconnectRecoveryIntegrationTest {

    private static final String CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440010";

    @LocalServerPort
    private int port;

    @Autowired
    private TemporaryJwtProperties jwtProperties;

    @Autowired
    private InMemoryChatMessageStore messageStore;

    @MockitoSpyBean
    private ChatCommandResultSender resultSender;

    @Test
    void retriesDisconnectedCommandWithSameUuidAsDuplicateWithoutRepublish()
            throws Exception {
        CountDownLatch firstResultSendEntered = new CountDownLatch(1);
        CountDownLatch releaseFirstResultSend = new CountDownLatch(1);
        AtomicBoolean firstResult = new AtomicBoolean(true);
        doAnswer(invocation -> {
            if (firstResult.compareAndSet(true, false)) {
                firstResultSendEntered.countDown();
                assertThat(releaseFirstResultSend.await(
                        5, TimeUnit.SECONDS)).isTrue();
            }
            return invocation.callRealMethod();
        }).when(resultSender).send(
                anyString(),
                anyString(),
                any(ChatCommandResult.class));

        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("stomp-reconnect-test-");
        scheduler.initialize();
        WebSocketStompClient client = stompClient(scheduler);
        StompSession firstSession = null;
        StompSession secondSession = null;
        try {
            firstSession = connect(client, "local-user-1");
            BlockingQueue<ChatMessageEventEnvelope> firstRoomEvents =
                    new LinkedBlockingQueue<>();
            BlockingQueue<ChatCommandResultEnvelope> firstResults =
                    new LinkedBlockingQueue<>();
            subscribe(
                    firstSession,
                    "/topic/rooms/test-room/messages",
                    ChatMessageEventEnvelope.class,
                    firstRoomEvents);
            subscribe(
                    firstSession,
                    "/user/queue/command-results",
                    ChatCommandResultEnvelope.class,
                    firstResults);

            firstSession.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand(
                            CLIENT_MESSAGE_ID,
                            "reconnect me"));

            ChatMessageEventEnvelope firstEvent =
                    firstRoomEvents.poll(5, TimeUnit.SECONDS);
            assertThat(firstEvent).isNotNull();
            assertThat(firstResultSendEntered.await(
                    5, TimeUnit.SECONDS)).isTrue();
            assertThat(messageStore.findById(
                    firstEvent.payload().messageId())).isPresent();

            firstSession.disconnect();
            releaseFirstResultSend.countDown();
            assertThat(firstResults.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();

            secondSession = connect(client, "local-user-1");
            BlockingQueue<ChatMessageEventEnvelope> secondRoomEvents =
                    new LinkedBlockingQueue<>();
            BlockingQueue<ChatCommandResultEnvelope> secondResults =
                    new LinkedBlockingQueue<>();
            subscribe(
                    secondSession,
                    "/topic/rooms/test-room/messages",
                    ChatMessageEventEnvelope.class,
                    secondRoomEvents);
            subscribe(
                    secondSession,
                    "/user/queue/command-results",
                    ChatCommandResultEnvelope.class,
                    secondResults);

            secondSession.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand(
                            CLIENT_MESSAGE_ID,
                            "reconnect me"));

            ChatCommandResultEnvelope duplicate =
                    secondResults.poll(5, TimeUnit.SECONDS);
            assertThat(duplicate).isNotNull();
            assertThat(duplicate.status()).isEqualTo("DUPLICATE");
            assertThat(duplicate.clientMessageId())
                    .isEqualTo(CLIENT_MESSAGE_ID);
            assertThat(duplicate.messageId())
                    .isEqualTo(firstEvent.payload().messageId());
            assertThat(duplicate.roomSequence())
                    .isEqualTo(firstEvent.payload().roomSequence());
            assertThat(secondRoomEvents.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();
            assertThat(messageStore.size()).isEqualTo(1);
        } finally {
            releaseFirstResultSend.countDown();
            disconnect(firstSession);
            disconnect(secondSession);
            client.stop();
            scheduler.shutdown();
        }
    }

    private WebSocketStompClient stompClient(
            ThreadPoolTaskScheduler scheduler
    ) {
        WebSocketStompClient client = new WebSocketStompClient(
                new StandardWebSocketClient());
        client.setMessageConverter(new CompositeMessageConverter(List.of(
                new ByteArrayMessageConverter(),
                new JacksonJsonMessageConverter())));
        client.setTaskScheduler(scheduler);
        client.start();
        return client;
    }

    private StompSession connect(
            WebSocketStompClient client,
            String subject
    ) throws Exception {
        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.set(
                "Authorization",
                "Bearer " + token(subject));
        connectHeaders.setHeartbeat(new long[]{10_000, 10_000});
        StompSession session = client.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        new WebSocketHttpHeaders(),
                        connectHeaders,
                        new StompSessionHandlerAdapter() {
                        })
                .get(5, TimeUnit.SECONDS);
        return session;
    }

    private <T> void subscribe(
            StompSession session,
            String destination,
            Class<T> payloadType,
            BlockingQueue<T> messages
    ) {
        session.subscribe(
                destination,
                collectingHandler(payloadType, messages));
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

    private static void disconnect(StompSession session) {
        if (session != null && session.isConnected()) {
            session.disconnect();
        }
    }
}
