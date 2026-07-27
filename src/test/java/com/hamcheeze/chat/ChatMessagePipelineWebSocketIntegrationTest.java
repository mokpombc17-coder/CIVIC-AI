package com.hamcheeze.chat;

import com.hamcheeze.chat.application.ChatCommandResultEnvelope;
import com.hamcheeze.chat.application.ChatSendCommand;
import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import com.hamcheeze.chat.message.inmemory.InMemoryChatMessageStore;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.config.LocalJwtProperties;
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
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import tools.jackson.databind.ObjectMapper;

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
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class ChatMessagePipelineWebSocketIntegrationTest {

    private static final String CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440000";
    private static final String SECOND_CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440001";
    private static final String FAILED_CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440002";

    @LocalServerPort
    private int port;

    @Autowired
    private LocalJwtProperties jwtProperties;

    @Autowired
    private ActiveConnectionRegistry activeConnections;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoSpyBean
    private InMemoryChatMessageStore messageStore;

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
        client.setMessageConverter(new CompositeMessageConverter(List.of(
                new ByteArrayMessageConverter(),
                new JacksonJsonMessageConverter())));
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
            BlockingQueue<byte[]> rawRoomMessages =
                    new LinkedBlockingQueue<>();
            BlockingQueue<ChatCommandResultEnvelope> commandResults =
                    new LinkedBlockingQueue<>();

            session.subscribe(
                    "/topic/rooms/test-room/messages",
                    collectingHandler(
                            byte[].class,
                            rawRoomMessages));
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
                    new ChatSendCommand(
                            CLIENT_MESSAGE_ID,
                            "  hello  "));

            byte[] rawRoomMessage =
                    rawRoomMessages.poll(5, TimeUnit.SECONDS);
            ChatMessageEventEnvelope roomMessage =
                    rawRoomMessage == null
                            ? null
                            : objectMapper.readValue(
                                    rawRoomMessage,
                                    ChatMessageEventEnvelope.class);
            ChatCommandResultEnvelope accepted =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(rawRoomMessage).isNotNull();
            assertThat(roomMessage).isNotNull();
            assertThat(roomMessage.eventVersion()).isEqualTo(1);
            assertThat(roomMessage.eventType())
                    .isEqualTo("CHAT_MESSAGE_CREATED");
            assertThat(roomMessage.payload().content())
                    .isEqualTo("hello");
            assertThat(roomMessage.payload().roomSequence())
                    .isEqualTo(1);
            assertThat(new String(
                    rawRoomMessage,
                    StandardCharsets.UTF_8))
                    .doesNotContain("senderUserId")
                    .doesNotContain("local-user-1");
            assertThat(accepted).isNotNull();
            assertThat(accepted.status()).isEqualTo("ACCEPTED");
            assertThat(accepted.clientMessageId())
                    .isEqualTo(CLIENT_MESSAGE_ID);
            assertThat(accepted.messageId())
                    .isEqualTo(roomMessage.payload().messageId());
            assertThat(accepted.roomSequence()).isEqualTo(1);
            assertThat(roomMessage.payload().clientMessageId())
                    .isEqualTo(accepted.clientMessageId());
            assertThat(messageStore.findById(accepted.messageId()))
                    .get()
                    .extracting(message -> message.senderUserId())
                    .isEqualTo("local-user-1");

            session.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand(CLIENT_MESSAGE_ID, "hello"));
            ChatCommandResultEnvelope duplicate =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(duplicate).isNotNull();
            assertThat(duplicate.status()).isEqualTo("DUPLICATE");
            assertThat(duplicate.clientMessageId())
                    .isEqualTo(CLIENT_MESSAGE_ID);
            assertThat(duplicate.messageId())
                    .isEqualTo(accepted.messageId());
            assertThat(duplicate.roomSequence())
                    .isEqualTo(accepted.roomSequence());

            session.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand(CLIENT_MESSAGE_ID, "changed"));
            ChatCommandResultEnvelope conflict =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(conflict).isNotNull();
            assertThat(conflict.status()).isEqualTo("REJECTED");
            assertThat(conflict.code())
                    .isEqualTo("IDEMPOTENCY_CONFLICT");
            assertThat(conflict.retryable()).isFalse();
            assertThat(conflict.clientMessageId())
                    .isEqualTo(CLIENT_MESSAGE_ID);
            assertThat(rawRoomMessages.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();

            session.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand(
                            SECOND_CLIENT_MESSAGE_ID,
                            "second"));
            ChatMessageEventEnvelope secondRoomMessage =
                    objectMapper.readValue(
                            rawRoomMessages.poll(
                                    5, TimeUnit.SECONDS),
                            ChatMessageEventEnvelope.class);
            ChatCommandResultEnvelope secondAccepted =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(secondAccepted).isNotNull();
            assertThat(secondAccepted.status()).isEqualTo("ACCEPTED");
            assertThat(secondAccepted.clientMessageId())
                    .isEqualTo(SECOND_CLIENT_MESSAGE_ID);
            assertThat(secondAccepted.roomSequence()).isEqualTo(2);
            assertThat(secondRoomMessage.payload().messageId())
                    .isEqualTo(secondAccepted.messageId());
            assertThat(secondRoomMessage.payload().roomSequence())
                    .isEqualTo(secondAccepted.roomSequence());
            assertThat(secondRoomMessage.payload().clientMessageId())
                    .isEqualTo(
                            secondAccepted.clientMessageId());

            doThrow(new ChatMessageStoreException(
                    ChatMessageStoreFailureKind.TRANSIENT,
                    "simulated persistence failure"))
                    .when(messageStore)
                    .append(argThat(message ->
                            message.clientMessageId().equals(
                                    FAILED_CLIENT_MESSAGE_ID)));
            session.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand(
                            FAILED_CLIENT_MESSAGE_ID,
                            "not stored"));
            ChatCommandResultEnvelope persistenceFailed =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(persistenceFailed).isNotNull();
            assertThat(persistenceFailed.status()).isEqualTo("FAILED");
            assertThat(persistenceFailed.code())
                    .isEqualTo("PERSISTENCE_FAILED");
            assertThat(persistenceFailed.retryable()).isTrue();
            assertThat(persistenceFailed.clientMessageId())
                    .isEqualTo(FAILED_CLIENT_MESSAGE_ID);
            assertThat(rawRoomMessages.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();

            int storedBeforeInvalidCommand = messageStore.size();
            session.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand(
                            "client-message-1",
                            "invalid id"));
            ChatCommandResultEnvelope invalidClientMessageId =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(invalidClientMessageId).isNotNull();
            assertThat(invalidClientMessageId.status())
                    .isEqualTo("REJECTED");
            assertThat(invalidClientMessageId.code())
                    .isEqualTo("INVALID_CLIENT_MESSAGE_ID");
            assertThat(invalidClientMessageId.retryable()).isFalse();
            assertThat(invalidClientMessageId.clientMessageId()).isNull();
            assertThat(messageStore.size())
                    .isEqualTo(storedBeforeInvalidCommand);
            assertThat(rawRoomMessages.poll(
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
