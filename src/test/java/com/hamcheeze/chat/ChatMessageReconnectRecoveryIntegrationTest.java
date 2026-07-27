package com.hamcheeze.chat;

import com.hamcheeze.chat.application.ChatCommandResult;
import com.hamcheeze.chat.application.ChatCommandResultEnvelope;
import com.hamcheeze.chat.application.ChatCommandResultSender;
import com.hamcheeze.chat.application.ChatCommandOutcome;
import com.hamcheeze.chat.application.ChatCommandOutcomeCode;
import com.hamcheeze.chat.application.ChatSendCommand;
import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.message.inmemory.InMemoryChatMessageStore;
import com.hamcheeze.chat.websocket.config.TemporaryJwtProperties;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
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
import org.springframework.test.annotation.DirtiesContext;
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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "chat.message-pipeline.mode=in-memory")
@ActiveProfiles("limit-test")
@DirtiesContext(
        classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class ChatMessageReconnectRecoveryIntegrationTest {

    private static final String CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440010";
    private static final String REPLACEMENT_CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440020";

    @LocalServerPort
    private int port;

    @Autowired
    private TemporaryJwtProperties jwtProperties;

    @Autowired
    private InMemoryChatMessageStore messageStore;

    @MockitoSpyBean
    private ActiveConnectionRegistry activeConnections;

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

    @Test
    void replacementConnectionDoesNotReceiveOldSessionResultAndRecoversByDuplicateRetry()
            throws Exception {
        CountDownLatch firstAcceptedSendEntered =
                new CountDownLatch(1);
        CountDownLatch releaseFirstAcceptedSend =
                new CountDownLatch(1);
        AtomicBoolean blockFirstAccepted = new AtomicBoolean(true);
        AtomicReference<String> originalResultConnection =
                new AtomicReference<>();
        AtomicInteger activationCount = new AtomicInteger();
        CountDownLatch firstConnectionActivated =
                new CountDownLatch(1);
        CountDownLatch secondConnectionActivated =
                new CountDownLatch(1);
        AtomicReference<String> firstServerConnection =
                new AtomicReference<>();
        AtomicReference<String> secondServerConnection =
                new AtomicReference<>();
        doAnswer(invocation -> {
            int activation = activationCount.incrementAndGet();
            String connectionId = invocation.getArgument(1);
            if (activation == 1) {
                firstServerConnection.set(connectionId);
                firstConnectionActivated.countDown();
            } else if (activation == 2) {
                secondServerConnection.set(connectionId);
                secondConnectionActivated.countDown();
            }
            return invocation.callRealMethod();
        }).when(activeConnections).activate(
                anyString(), anyString());
        doAnswer(invocation -> {
            ChatCommandResult result = invocation.getArgument(2);
            if (result instanceof ChatCommandOutcome outcome
                    && outcome.code()
                            == ChatCommandOutcomeCode.ACCEPTED
                    && REPLACEMENT_CLIENT_MESSAGE_ID.equals(
                            outcome.clientMessageId())
                    && blockFirstAccepted.compareAndSet(
                            true, false)) {
                originalResultConnection.set(
                        invocation.getArgument(1));
                firstAcceptedSendEntered.countDown();
                assertThat(releaseFirstAcceptedSend.await(
                        5, TimeUnit.SECONDS)).isTrue();
            }
            return invocation.callRealMethod();
        }).when(resultSender).send(
                anyString(),
                anyString(),
                any(ChatCommandResult.class));

        ThreadPoolTaskScheduler scheduler =
                new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix(
                "stomp-replacement-test-");
        scheduler.initialize();
        WebSocketStompClient client = stompClient(scheduler);
        StompSession firstSession = null;
        StompSession secondSession = null;
        CountDownLatch firstSessionClosed = new CountDownLatch(1);
        try {
            firstSession = connect(
                    client,
                    "local-user-1",
                    new StompSessionHandlerAdapter() {
                        @Override
                        public void handleTransportError(
                                StompSession session,
                                Throwable exception
                        ) {
                            firstSessionClosed.countDown();
                        }
                    });
            assertThat(firstConnectionActivated.await(
                    5, TimeUnit.SECONDS)).isTrue();
            String firstConnectionId =
                    firstServerConnection.get();
            assertThat(firstConnectionId).isNotBlank();
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
                            REPLACEMENT_CLIENT_MESSAGE_ID,
                            "replace and retry"));
            ChatMessageEventEnvelope firstEvent =
                    firstRoomEvents.poll(5, TimeUnit.SECONDS);
            assertThat(firstEvent).isNotNull();
            assertThat(firstAcceptedSendEntered.await(
                    5, TimeUnit.SECONDS)).isTrue();
            assertThat(originalResultConnection)
                    .hasValue(firstConnectionId);
            assertThat(messageStore.findById(
                    firstEvent.payload().messageId())).isPresent();

            secondSession = connect(client, "local-user-1");
            assertThat(secondConnectionActivated.await(
                    5, TimeUnit.SECONDS)).isTrue();
            String secondConnectionId =
                    secondServerConnection.get();
            assertThat(secondConnectionId).isNotBlank();
            assertThat(firstSessionClosed.await(
                    5, TimeUnit.SECONDS)).isTrue();
            awaitActiveConnection(
                    firstConnectionId,
                    secondConnectionId);
            assertThat(firstSession.isConnected()).isFalse();

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
                            "invalid-client-message-id",
                            "subscription barrier"));
            ChatCommandResultEnvelope barrierResult =
                    secondResults.poll(5, TimeUnit.SECONDS);
            assertThat(barrierResult).isNotNull();
            assertThat(barrierResult.code())
                    .isEqualTo("INVALID_CLIENT_MESSAGE_ID");

            releaseFirstAcceptedSend.countDown();
            assertThat(secondResults.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();
            assertThat(secondRoomEvents.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();
            assertThat(firstResults).isEmpty();

            secondSession.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand(
                            REPLACEMENT_CLIENT_MESSAGE_ID,
                            "replace and retry"));
            ChatCommandResultEnvelope duplicate =
                    secondResults.poll(5, TimeUnit.SECONDS);

            assertThat(duplicate).isNotNull();
            assertThat(duplicate.status()).isEqualTo("DUPLICATE");
            assertThat(duplicate.clientMessageId())
                    .isEqualTo(REPLACEMENT_CLIENT_MESSAGE_ID);
            assertThat(duplicate.messageId())
                    .isEqualTo(firstEvent.payload().messageId());
            assertThat(duplicate.roomSequence())
                    .isEqualTo(firstEvent.payload().roomSequence());
            assertThat(secondRoomEvents.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();
            assertThat(messageStore.size()).isEqualTo(1);
        } finally {
            releaseFirstAcceptedSend.countDown();
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
        return connect(
                client,
                subject,
                new StompSessionHandlerAdapter() {
                });
    }

    private StompSession connect(
            WebSocketStompClient client,
            String subject,
            StompSessionHandlerAdapter sessionHandler
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
                        sessionHandler)
                .get(5, TimeUnit.SECONDS);
        return session;
    }

    private void awaitActiveConnection(
            String oldConnectionId,
            String newConnectionId
    ) {
        long deadline = System.nanoTime()
                + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (activeConnections.activeCount() == 1
                    && activeConnections.isActive(
                            "local-user-1",
                            newConnectionId)
                    && !activeConnections.isActive(
                            "local-user-1",
                            oldConnectionId)) {
                return;
            }
            Thread.onSpinWait();
        }
        assertThat(activeConnections.activeCount()).isEqualTo(1);
        assertThat(activeConnections.isActive(
                "local-user-1",
                newConnectionId)).isTrue();
        assertThat(activeConnections.isActive(
                "local-user-1",
                oldConnectionId)).isFalse();
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
