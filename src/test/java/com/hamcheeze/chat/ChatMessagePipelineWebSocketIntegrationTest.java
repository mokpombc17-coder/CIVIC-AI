package com.hamcheeze.chat;

import com.hamcheeze.chat.application.ChatCommandResultEnvelope;
import com.hamcheeze.chat.application.ChatDeleteCommand;
import com.hamcheeze.chat.application.ChatEditCommand;
import com.hamcheeze.chat.application.ChatSendCommand;
import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePublisher;
import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ChatMessageStoreFailureKind;
import com.hamcheeze.chat.message.mongo.MongoChatMessageDocument;
import com.hamcheeze.chat.message.mongo.MongoRoomSequenceDocument;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.config.LocalJwtProperties;
import com.hamcheeze.chat.websocket.subscription.ChatSubscriptionRegistry;
import com.hamcheeze.chat.websocket.subscription.SubscriptionDescriptor;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.data.mongodb.core.query.Query;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "chat.websocket.rate-limit.user.capacity=100",
                "chat.websocket.rate-limit.user.refill-tokens=100"
        })
@ActiveProfiles("local")
class ChatMessagePipelineWebSocketIntegrationTest
        extends MongoRuntimeIntegrationTest {

    private static final String CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440000";
    private static final String SECOND_CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440001";
    private static final String FAILED_CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440002";
    private static final String PERMANENT_FAILED_CLIENT_MESSAGE_ID =
            "550e8400-e29b-41d4-a716-446655440003";
    private static final String EDIT_MUTATION_ID =
            "550e8400-e29b-41d4-a716-446655440010";
    private static final String DELETE_MUTATION_ID =
            "550e8400-e29b-41d4-a716-446655440011";

    @LocalServerPort
    private int port;

    @Autowired
    private LocalJwtProperties jwtProperties;

    @Autowired
    private ActiveConnectionRegistry activeConnections;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RoomCommandService roomCommandService;

    @Autowired
    private ChatMessagePublisher messagePublisher;

    @MockitoSpyBean(name = "chatMessageStore")
    private ChatMessageStore messageStore;

    @MockitoSpyBean
    private ChatSubscriptionRegistry subscriptions;

    @BeforeEach
    void seedMembershipAuthorizationFixture() {
        seedActiveRoom("test-room", "local-user-1");
    }

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
            assertThat(roomMessage.payload().senderUserId())
                    .isEqualTo("local-user-1");
            assertThat(new String(
                    rawRoomMessage,
                    StandardCharsets.UTF_8))
                    .contains(
                            "\"senderUserId\":\"local-user-1\"");
            assertThat(accepted).isNotNull();
            assertThat(accepted.status()).isEqualTo("ACCEPTED");
            assertThat(accepted.clientMessageId())
                    .isEqualTo(CLIENT_MESSAGE_ID);
            assertThat(accepted.messageId())
                    .isEqualTo(roomMessage.payload().messageId());
            assertThat(accepted.roomSequence()).isEqualTo(1);
            assertThat(roomMessage.payload().clientMessageId())
                    .isEqualTo(accepted.clientMessageId());
            MongoChatMessageDocument storedDocument =
                    mongoOperations.findById(
                            accepted.messageId(),
                            MongoChatMessageDocument.class);
            assertThat(storedDocument).isNotNull();
            assertThat(storedDocument.roomId())
                    .isEqualTo("test-room");
            assertThat(storedDocument.senderUserId())
                    .isEqualTo("local-user-1");
            assertThat(storedDocument.clientMessageId())
                    .isEqualTo(CLIENT_MESSAGE_ID);
            assertThat(storedDocument.content()).isEqualTo("hello");
            assertThat(storedDocument.roomSequence()).isEqualTo(1);
            assertThat(storedDocument.schemaVersion()).isEqualTo(3);
            assertThat(storedDocument.countable()).isTrue();
            assertThat(storedDocument.messageVersion()).isEqualTo(1);
            assertThat(storedDocument.state().name())
                    .isEqualTo("ACTIVE");
            assertThat(storedMessageCount()).isEqualTo(1);
            assertThat(lastRoomSequence()).isEqualTo(1);

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
            assertThat(rawRoomMessages.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();
            assertThat(storedMessageCount()).isEqualTo(1);
            assertThat(lastRoomSequence()).isEqualTo(1);

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
            assertThat(storedMessageCount()).isEqualTo(1);
            assertThat(lastRoomSequence()).isEqualTo(1);

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
            assertThat(secondRoomMessage.payload().senderUserId())
                    .isEqualTo("local-user-1");
            assertThat(secondRoomMessage.payload().clientMessageId())
                    .isEqualTo(
                            secondAccepted.clientMessageId());
            assertThat(storedMessageCount()).isEqualTo(2);
            assertThat(lastRoomSequence()).isEqualTo(2);

            session.send(
                    "/app/rooms/test-room/messages/edit",
                    new ChatEditCommand(
                            EDIT_MUTATION_ID,
                            secondAccepted.messageId(),
                            "edited second"));
            ChatMessageEventEnvelope updatedEvent =
                    objectMapper.readValue(
                            rawRoomMessages.poll(
                                    5, TimeUnit.SECONDS),
                            ChatMessageEventEnvelope.class);
            ChatCommandResultEnvelope updatedResult =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(updatedEvent.eventType())
                    .isEqualTo("CHAT_MESSAGE_UPDATED");
            assertThat(updatedEvent.payload().content())
                    .isEqualTo("edited second");
            assertThat(updatedEvent.payload().roomSequence())
                    .isEqualTo(2);
            assertThat(updatedEvent.payload().messageVersion())
                    .isEqualTo(2);
            assertThat(updatedResult).isNotNull();
            assertThat(updatedResult.commandType())
                    .isEqualTo("EDIT_MESSAGE");
            assertThat(updatedResult.clientMutationId())
                    .isEqualTo(EDIT_MUTATION_ID);
            assertThat(updatedResult.status()).isEqualTo("UPDATED");
            assertThat(updatedResult.messageVersion()).isEqualTo(2);
            assertThat(updatedResult.replayed()).isFalse();
            assertThat(lastRoomSequence()).isEqualTo(2);

            session.send(
                    "/app/rooms/test-room/messages/edit",
                    new ChatEditCommand(
                            EDIT_MUTATION_ID,
                            secondAccepted.messageId(),
                            "edited second"));
            ChatCommandResultEnvelope editReplay =
                    commandResults.poll(5, TimeUnit.SECONDS);
            assertThat(editReplay).isNotNull();
            assertThat(editReplay.status()).isEqualTo("UPDATED");
            assertThat(editReplay.replayed()).isTrue();
            assertThat(editReplay.messageVersion()).isEqualTo(2);
            assertThat(rawRoomMessages.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();

            session.send(
                    "/app/rooms/test-room/messages/delete",
                    new ChatDeleteCommand(
                            DELETE_MUTATION_ID,
                            secondAccepted.messageId()));
            ChatCommandResultEnvelope deletedResult =
                    commandResults.poll(5, TimeUnit.SECONDS);
            if (deletedResult != null
                    && "USER_RATE_LIMITED".equals(
                    deletedResult.code())) {
                Thread.sleep(deletedResult.retryAfterMs() + 50);
                session.send(
                        "/app/rooms/test-room/messages/delete",
                        new ChatDeleteCommand(
                                DELETE_MUTATION_ID,
                                secondAccepted.messageId()));
                deletedResult =
                        commandResults.poll(5, TimeUnit.SECONDS);
            }
            byte[] rawDeletedEvent =
                    rawRoomMessages.poll(5, TimeUnit.SECONDS);

            assertThat(rawDeletedEvent)
                    .withFailMessage(
                            "DELETE event missing; command result=%s",
                            deletedResult)
                    .isNotNull();
            ChatMessageEventEnvelope deletedEvent =
                    objectMapper.readValue(
                            rawDeletedEvent,
                            ChatMessageEventEnvelope.class);
            assertThat(deletedEvent.eventType())
                    .isEqualTo("CHAT_MESSAGE_DELETED");
            assertThat(deletedEvent.payload().content()).isNull();
            assertThat(deletedEvent.payload().roomSequence())
                    .isEqualTo(2);
            assertThat(deletedEvent.payload().messageVersion())
                    .isEqualTo(3);
            assertThat(deletedResult).isNotNull();
            assertThat(deletedResult.status()).isEqualTo("DELETED");
            assertThat(deletedResult.messageVersion()).isEqualTo(3);
            MongoChatMessageDocument tombstone =
                    mongoOperations.findById(
                            secondAccepted.messageId(),
                            MongoChatMessageDocument.class);
            assertThat(tombstone).isNotNull();
            assertThat(tombstone.content()).isNull();
            assertThat(tombstone.state().name())
                    .isEqualTo("DELETED_BY_AUTHOR");
            assertThat(tombstone.roomSequence()).isEqualTo(2);
            assertThat(lastRoomSequence()).isEqualTo(2);

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
            assertThat(storedMessageCount()).isEqualTo(2);
            assertThat(lastRoomSequence()).isEqualTo(2);

            doThrow(new ChatMessageStoreException(
                    ChatMessageStoreFailureKind.PERMANENT,
                    "simulated permanent persistence failure"))
                    .when(messageStore)
                    .append(argThat(message ->
                            message.clientMessageId().equals(
                                    PERMANENT_FAILED_CLIENT_MESSAGE_ID)));
            session.send(
                    "/app/rooms/test-room/messages",
                    new ChatSendCommand(
                            PERMANENT_FAILED_CLIENT_MESSAGE_ID,
                            "not stored permanently"));
            ChatCommandResultEnvelope permanentPersistenceFailed =
                    commandResults.poll(5, TimeUnit.SECONDS);

            assertThat(permanentPersistenceFailed).isNotNull();
            assertThat(permanentPersistenceFailed.status())
                    .isEqualTo("FAILED");
            assertThat(permanentPersistenceFailed.code())
                    .isEqualTo("PERSISTENCE_FAILED");
            assertThat(permanentPersistenceFailed.retryable()).isFalse();
            assertThat(permanentPersistenceFailed.clientMessageId())
                    .isEqualTo(PERMANENT_FAILED_CLIENT_MESSAGE_ID);
            assertThat(rawRoomMessages.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();
            assertThat(storedMessageCount()).isEqualTo(2);
            assertThat(lastRoomSequence()).isEqualTo(2);

            long storedBeforeInvalidCommand = storedMessageCount();
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
            assertThat(storedMessageCount())
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

    @Test
    void simpleBrokerDropsDelayedMessageAtJoinBoundary()
            throws Exception {
        mongoOperations.save(new MongoRoomSequenceDocument(
                "test-room", 100, 0));
        roomCommandService.joinRoom(new JoinRoomCommand(
                "local-user-2",
                java.util.UUID.randomUUID().toString(),
                "test-room"));
        assertThat(membershipStore.findByRoomIdAndUserId(
                        "test-room", "local-user-2")
                .orElseThrow()
                .messageVisibleAfterSequence())
                .isEqualTo(100);

        ThreadPoolTaskScheduler scheduler =
                new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("stomp-visibility-test-");
        scheduler.initialize();
        WebSocketStompClient client = new WebSocketStompClient(
                new StandardWebSocketClient());
        client.setMessageConverter(new CompositeMessageConverter(
                List.of(
                        new ByteArrayMessageConverter(),
                        new JacksonJsonMessageConverter())));
        client.setTaskScheduler(scheduler);
        client.start();

        StompSession session = null;
        try {
            StompHeaders connectHeaders = new StompHeaders();
            connectHeaders.set(
                    "Authorization",
                    "Bearer " + token("local-user-2"));
            session = client.connectAsync(
                            "ws://localhost:" + port + "/ws",
                            new WebSocketHttpHeaders(),
                            connectHeaders,
                            new StompSessionHandlerAdapter() {
                            })
                    .get(5, TimeUnit.SECONDS);
            BlockingQueue<ChatMessageEventEnvelope> messages =
                    new LinkedBlockingQueue<>();
            CountDownLatch subscribed = new CountDownLatch(1);
            doAnswer(invocation -> {
                Object result = invocation.callRealMethod();
                SubscriptionDescriptor descriptor =
                        invocation.getArgument(1);
                if ("local-user-2".equals(descriptor.userId())
                        && descriptor.kind()
                        == com.hamcheeze.chat.websocket.protocol
                        .DestinationKind.TOPIC_ROOM_MESSAGES) {
                    subscribed.countDown();
                }
                return result;
            }).when(subscriptions).register(
                    anyString(),
                    any(SubscriptionDescriptor.class));
            session.subscribe(
                    "/topic/rooms/test-room/messages",
                    collectingHandler(
                            ChatMessageEventEnvelope.class,
                            messages));
            assertThat(subscribed.await(5, TimeUnit.SECONDS)).isTrue();

            messagePublisher.publish(event(100));
            assertThat(messages.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();

            messagePublisher.publish(updatedEvent(100));
            assertThat(messages.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();

            messagePublisher.publish(deletedEvent(100));
            assertThat(messages.poll(
                    300, TimeUnit.MILLISECONDS)).isNull();

            messagePublisher.publish(updatedEvent(101));
            assertThat(messages.poll(5, TimeUnit.SECONDS))
                    .isEqualTo(updatedEvent(101));
        } finally {
            if (session != null && session.isConnected()) {
                session.disconnect();
            }
            client.stop();
            scheduler.shutdown();
        }
    }

    private long storedMessageCount() {
        return mongoOperations.count(
                new Query(),
                MongoChatMessageDocument.COLLECTION_NAME);
    }

    private long lastRoomSequence() {
        MongoRoomSequenceDocument sequence =
                mongoOperations.findById(
                        "test-room",
                        MongoRoomSequenceDocument.class);
        assertThat(sequence).isNotNull();
        return sequence.lastSequence();
    }

    private static ChatMessageEventEnvelope event(long sequence) {
        return ChatMessageEventEnvelope.messageCreated(
                new ChatMessage(
                        "message-" + sequence,
                        "test-room",
                        sequence,
                        "local-user-1",
                        "550e8400-e29b-41d4-a716-44665544%04d"
                                .formatted(sequence),
                        "message " + sequence,
                        Instant.parse("2026-07-24T00:00:00Z")
                                .plusSeconds(sequence)));
    }

    private static ChatMessageEventEnvelope updatedEvent(
            long sequence
    ) {
        Instant createdAt = Instant.parse(
                "2026-07-24T00:00:00Z").plusSeconds(sequence);
        return ChatMessageEventEnvelope.messageUpdated(
                new ChatMessage(
                        "message-" + sequence,
                        "test-room",
                        sequence,
                        "local-user-1",
                        "550e8400-e29b-41d4-a716-44665544%04d"
                                .formatted(sequence),
                        "updated " + sequence,
                        MessageState.ACTIVE,
                        2,
                        createdAt,
                        createdAt.plusSeconds(1),
                        null));
    }

    private static ChatMessageEventEnvelope deletedEvent(
            long sequence
    ) {
        Instant createdAt = Instant.parse(
                "2026-07-24T00:00:00Z").plusSeconds(sequence);
        Instant deletedAt = createdAt.plusSeconds(2);
        return ChatMessageEventEnvelope.messageDeleted(
                new ChatMessage(
                        "message-" + sequence,
                        "test-room",
                        sequence,
                        "local-user-1",
                        "550e8400-e29b-41d4-a716-44665544%04d"
                                .formatted(sequence),
                        null,
                        MessageState.DELETED_BY_AUTHOR,
                        3,
                        createdAt,
                        deletedAt,
                        deletedAt));
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
                        .claim(
                                "scope",
                                "chat:connect chat:rooms:read "
                                        + "chat:rooms:write "
                                        + "chat:messages:write")
                        .issueTime(Date.from(now.minusSeconds(1)))
                        .expirationTime(Date.from(
                                now.plusSeconds(3_600)))
                        .build());
        jwt.sign(new MACSigner(jwtProperties.getSecret()
                .getBytes(StandardCharsets.UTF_8)));
        return jwt.serialize();
    }
}
