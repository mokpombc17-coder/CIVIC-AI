package com.hamcheeze.chat;

import com.hamcheeze.chat.application.ChatSendCommand;
import com.hamcheeze.chat.security.CookieOrHeaderBearerTokenResolver;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.inbox.RoomReadStateService;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.websocket.config.LocalJwtProperties;
import com.hamcheeze.chat.websocket.subscription.ChatSubscriptionRegistry;
import com.hamcheeze.chat.websocket.subscription.RoomSubscriptionSyncRequest;
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
import org.springframework.messaging.converter.ByteArrayMessageConverter;
import org.springframework.messaging.converter.CompositeMessageConverter;
import org.springframework.messaging.converter.JacksonJsonMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class RoomEventWebSocketIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private LocalJwtProperties jwtProperties;

    @Autowired
    private RoomCommandService commandService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ChatSubscriptionRegistry subscriptions;

    @Autowired
    private RoomReadStateService readStateService;

    @Test
    void publishesSamePublicEnvelopeToRoomAndAffectedUser()
            throws Exception {
        RoomCommandExecution created = commandService.createRoom(
                new CreateRoomCommand(
                        "owner-1",
                        uuid(),
                        "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN));
        String roomId = created.result().roomId();
        ThreadPoolTaskScheduler scheduler =
                new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("room-event-stomp-");
        scheduler.initialize();
        WebSocketStompClient client = stompClient(scheduler);
        StompSession ownerSession = null;
        StompSession memberSession = null;
        try {
            ownerSession = connect(client, "owner-1");
            memberSession = connect(client, "user-2");
            BlockingQueue<byte[]> roomEvents =
                    new LinkedBlockingQueue<>();
            BlockingQueue<byte[]> userEvents =
                    new LinkedBlockingQueue<>();
            ownerSession.subscribe(
                    "/topic/rooms/" + roomId + "/messages",
                    collectingHandler(new LinkedBlockingQueue<>()));
            ownerSession.subscribe(
                    "/topic/rooms/" + roomId + "/room-events",
                    collectingHandler(roomEvents));
            waitUntil(() -> !subscriptions
                    .findConnectionIdsByUserAndRoom(
                            "owner-1",
                            roomId)
                    .isEmpty());
            int subscriptionCount =
                    subscriptions.activeSubscriptionCount();
            memberSession.subscribe(
                    "/user/queue/system-events",
                    collectingHandler(userEvents));
            waitUntil(() -> subscriptions.activeSubscriptionCount()
                    > subscriptionCount);

            RoomCommandExecution joined = commandService.joinRoom(
                    new JoinRoomCommand(
                            "user-2",
                            uuid(),
                            roomId));

            byte[] roomBytes = roomEvents.poll(
                    5,
                    TimeUnit.SECONDS);
            byte[] userBytes = userEvents.poll(
                    5,
                    TimeUnit.SECONDS);
            assertThat(roomBytes).isNotNull();
            assertThat(userBytes).isNotNull();
            JsonNode roomEvent = objectMapper.readTree(roomBytes);
            JsonNode userEvent = objectMapper.readTree(userBytes);
            assertThat(roomEvent.get("eventVersion").asInt())
                    .isEqualTo(2);
            assertThat(roomEvent.get("eventType").asText())
                    .isEqualTo("ROOM_MEMBER_JOINED");
            assertThat(roomEvent.get("eventId").asText())
                    .isEqualTo(userEvent.get("eventId").asText());
            assertThat(roomEvent.get("payload")
                    .get("roomVersion").asLong())
                    .isEqualTo(joined.result().roomVersion());
            assertThat(roomEvent.get("payload")
                    .get("member")
                    .get("membershipVersion")
                    .asLong())
                    .isEqualTo(joined.result().membershipVersion());
            assertThat(roomEvent.get("payload")
                    .get("member")
                    .get("membershipId")
                    .asText())
                    .isEqualTo(joined.result().membershipId());
            String publicJson = new String(
                    roomBytes,
                    StandardCharsets.UTF_8);
            assertThat(publicJson)
                    .doesNotContain("userId")
                    .doesNotContain("owner-1")
                    .doesNotContain("clientRequestId");
        } finally {
            disconnect(ownerSession);
            disconnect(memberSession);
            client.stop();
            scheduler.shutdown();
        }
    }

    @Test
    void switchesRoomsAfterOrderedUnsubscriptionsAndRejectsPrematureSwitch()
            throws Exception {
        String firstRoomId = commandService.createRoom(
                new CreateRoomCommand(
                        "owner-1",
                        uuid(),
                        "First room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN))
                .result()
                .roomId();
        String secondRoomId = commandService.createRoom(
                new CreateRoomCommand(
                        "owner-1",
                        uuid(),
                        "Second room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN))
                .result()
                .roomId();

        ThreadPoolTaskScheduler scheduler =
                new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("room-switch-stomp-");
        scheduler.initialize();
        WebSocketStompClient client = stompClient(scheduler);
        StompSession session = null;
        try {
            session = connect(client, "owner-1");
            int initialSubscriptionCount =
                    subscriptions.activeSubscriptionCount();
            BlockingQueue<byte[]> systemEvents =
                    new LinkedBlockingQueue<>();
            BlockingQueue<byte[]> secondRoomMessages =
                    new LinkedBlockingQueue<>();

            session.subscribe(
                    "/user/queue/system-events",
                    collectingHandler(systemEvents));
            waitUntil(() -> subscriptions.activeSubscriptionCount()
                    == initialSubscriptionCount + 1);

            StompSession.Subscription firstRoomMessages =
                    session.subscribe(
                            "/topic/rooms/"
                                    + firstRoomId
                                    + "/messages",
                            collectingHandler(
                                    new LinkedBlockingQueue<>()));
            StompSession.Subscription firstRoomEvents =
                    session.subscribe(
                            "/topic/rooms/"
                                    + firstRoomId
                                    + "/room-events",
                            collectingHandler(
                                    new LinkedBlockingQueue<>()));
            waitUntil(() -> !subscriptions
                    .findConnectionIdsByUserAndRoom(
                            "owner-1",
                            firstRoomId)
                    .isEmpty());

            firstRoomMessages.unsubscribe();
            StompSession.Subscription prematureSecondRoom =
                    session.subscribe(
                            "/topic/rooms/"
                                    + secondRoomId
                                    + "/messages",
                            collectingHandler(
                                    new LinkedBlockingQueue<>()));

            byte[] rejectionBytes =
                    systemEvents.poll(5, TimeUnit.SECONDS);
            assertThat(rejectionBytes).isNotNull();
            JsonNode rejection =
                    objectMapper.readTree(rejectionBytes);
            assertThat(rejection.get("code").asText())
                    .isEqualTo("ACTIVE_ROOM_LIMIT_EXCEEDED");
            assertThat(session.isConnected()).isTrue();

            prematureSecondRoom.unsubscribe();
            firstRoomEvents.unsubscribe();
            session.subscribe(
                    "/topic/rooms/"
                            + secondRoomId
                            + "/messages",
                    collectingHandler(secondRoomMessages));
            session.subscribe(
                    "/topic/rooms/"
                            + secondRoomId
                            + "/room-events",
                    collectingHandler(
                            new LinkedBlockingQueue<>()));

            waitUntil(() -> subscriptions
                    .findConnectionIdsByUserAndRoom(
                            "owner-1",
                            firstRoomId)
                    .isEmpty()
                    && !subscriptions
                    .findConnectionIdsByUserAndRoom(
                            "owner-1",
                            secondRoomId)
                    .isEmpty()
                    && subscriptions.activeSubscriptionCount()
                    == initialSubscriptionCount + 3);

            String clientMessageId = uuid();
            session.send(
                    "/app/rooms/"
                            + secondRoomId
                            + "/messages",
                    new ChatSendCommand(
                            clientMessageId,
                            "room switched"));

            byte[] messageBytes =
                    secondRoomMessages.poll(5, TimeUnit.SECONDS);
            assertThat(messageBytes).isNotNull();
            JsonNode message = objectMapper.readTree(messageBytes);
            assertThat(message.get("eventType").asText())
                    .isEqualTo("CHAT_MESSAGE_CREATED");
            assertThat(message.get("payload")
                    .get("roomId").asText())
                    .isEqualTo(secondRoomId);
            assertThat(message.get("payload")
                    .get("clientMessageId").asText())
                    .isEqualTo(clientMessageId);
            assertThat(systemEvents.poll(
                    250,
                    TimeUnit.MILLISECONDS)).isNull();
        } finally {
            disconnect(session);
            client.stop();
            scheduler.shutdown();
        }
    }

    @Test
    void confirmsRoomSubscriptionsBeforeHistorySynchronization()
            throws Exception {
        String roomId = commandService.createRoom(
                new CreateRoomCommand(
                        "owner-1",
                        uuid(),
                        "Subscription sync room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN))
                .result()
                .roomId();

        ThreadPoolTaskScheduler scheduler =
                new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix(
                "room-subscription-sync-stomp-");
        scheduler.initialize();
        WebSocketStompClient client = stompClient(scheduler);
        StompSession session = null;
        try {
            session = connect(client, "owner-1");
            BlockingQueue<byte[]> systemEvents =
                    new LinkedBlockingQueue<>();
            BlockingQueue<byte[]> roomMessages =
                    new LinkedBlockingQueue<>();

            session.subscribe(
                    "/user/queue/system-events",
                    collectingHandler(systemEvents));
            session.subscribe(
                    "/topic/rooms/" + roomId + "/messages",
                    collectingHandler(roomMessages));
            session.subscribe(
                    "/topic/rooms/"
                            + roomId
                            + "/room-events",
                    collectingHandler(
                            new LinkedBlockingQueue<>()));
            session.subscribe(
                    "/topic/rooms/"
                            + roomId
                            + "/read-receipts",
                    collectingHandler(
                            new LinkedBlockingQueue<>()));

            String requestId = uuid();
            session.send(
                    "/app/rooms/"
                            + roomId
                            + "/subscriptions/sync",
                    new RoomSubscriptionSyncRequest(requestId));

            byte[] readyBytes =
                    systemEvents.poll(5, TimeUnit.SECONDS);
            assertThat(readyBytes).isNotNull();
            JsonNode ready = objectMapper.readTree(readyBytes);
            assertThat(ready.get("status").asText())
                    .isEqualTo("READY");
            assertThat(ready.get("eventType").asText())
                    .isEqualTo(
                            "ROOM_SUBSCRIPTIONS_READY");
            assertThat(ready.get("requestId").asText())
                    .isEqualTo(requestId);
            assertThat(ready.get("roomId").asText())
                    .isEqualTo(roomId);
            assertThat(ready.get(
                    "messageVisibleAfterSequence").asLong())
                    .isZero();
            assertThat(ready.get("watermarkSequence")
                    .asLong())
                    .isZero();

            String clientMessageId = uuid();
            session.send(
                    "/app/rooms/" + roomId + "/messages",
                    new ChatSendCommand(
                            clientMessageId,
                            "after ready"));

            byte[] messageBytes =
                    roomMessages.poll(5, TimeUnit.SECONDS);
            assertThat(messageBytes).isNotNull();
            JsonNode message =
                    objectMapper.readTree(messageBytes);
            assertThat(message.get("payload")
                    .get("clientMessageId").asText())
                    .isEqualTo(clientMessageId);
            assertThat(message.get("payload")
                    .get("roomSequence").asLong())
                    .isEqualTo(1L);
        } finally {
            disconnect(session);
            client.stop();
            scheduler.shutdown();
        }
    }

    @Test
    void publishesStoredReadCursorToReadReceiptTopicOnlyOnAdvance()
            throws Exception {
        RoomCommandExecution created = commandService.createRoom(
                new CreateRoomCommand(
                        "owner-1",
                        uuid(),
                        "Read receipt room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN));
        String roomId = created.result().roomId();
        RoomCommandExecution joined = commandService.joinRoom(
                new JoinRoomCommand("user-2", uuid(), roomId));

        ThreadPoolTaskScheduler scheduler =
                new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("read-receipt-stomp-");
        scheduler.initialize();
        WebSocketStompClient client = stompClient(scheduler);
        StompSession session = null;
        try {
            session = connect(client, "owner-1");
            BlockingQueue<byte[]> messages =
                    new LinkedBlockingQueue<>();
            BlockingQueue<byte[]> receipts =
                    new LinkedBlockingQueue<>();
            int initialSubscriptionCount =
                    subscriptions.activeSubscriptionCount();
            session.subscribe(
                    "/topic/rooms/" + roomId + "/messages",
                    collectingHandler(messages));
            session.subscribe(
                    "/topic/rooms/" + roomId + "/room-events",
                    collectingHandler(new LinkedBlockingQueue<>()));
            session.subscribe(
                    "/topic/rooms/" + roomId + "/read-receipts",
                    collectingHandler(receipts));
            waitUntil(() -> subscriptions.activeSubscriptionCount()
                    >= initialSubscriptionCount + 3);

            session.send(
                    "/app/rooms/" + roomId + "/messages",
                    new ChatSendCommand(uuid(), "receipt source"));
            byte[] createdMessage = messages.poll(
                    5, TimeUnit.SECONDS);
            assertThat(createdMessage).isNotNull();
            assertThat(objectMapper.readTree(createdMessage)
                    .get("payload")
                    .get("roomSequence")
                    .asLong()).isEqualTo(1);

            readStateService.update("user-2", roomId, 1);

            byte[] receiptBytes = receipts.poll(
                    5, TimeUnit.SECONDS);
            assertThat(receiptBytes).isNotNull();
            String rawReceipt = new String(
                    receiptBytes, StandardCharsets.UTF_8);
            JsonNode receipt = objectMapper.readTree(receiptBytes);
            assertThat(receipt.get("eventVersion").asInt())
                    .isEqualTo(1);
            assertThat(receipt.get("eventType").asText())
                    .isEqualTo("ROOM_READ_POSITIONS_ADVANCED");
            JsonNode update = receipt.get("payload")
                    .get("updates").get(0);
            assertThat(update.get("membershipId").asText())
                    .isEqualTo(joined.result().membershipId());
            assertThat(update.get("membershipVersion").asLong())
                    .isEqualTo(joined.result().membershipVersion());
            assertThat(update.get("storedLastReadSequence").asLong())
                    .isEqualTo(1);
            assertThat(rawReceipt).doesNotContain("userId");

            readStateService.update("user-2", roomId, 1);
            assertThat(receipts.poll(600, TimeUnit.MILLISECONDS))
                    .isNull();
        } finally {
            disconnect(session);
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
            String userId
    ) throws Exception {
        StompHeaders headers = new StompHeaders();
        headers.setHeartbeat(new long[]{10_000, 10_000});
        WebSocketHttpHeaders webSocketHeaders =
                new WebSocketHttpHeaders();
        webSocketHeaders.add(
                HttpHeaders.COOKIE,
                CookieOrHeaderBearerTokenResolver.COOKIE_NAME
                        + "="
                        + token(userId));
        return client.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        webSocketHeaders,
                        headers,
                        new StompSessionHandlerAdapter() {
                        })
                .get(5, TimeUnit.SECONDS);
    }

    private static StompFrameHandler collectingHandler(
            BlockingQueue<byte[]> messages
    ) {
        return new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return byte[].class;
            }

            @Override
            public void handleFrame(
                    StompHeaders headers,
                    Object payload
            ) {
                messages.add((byte[]) payload);
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
                        .audience(List.of(jwtProperties.getAudience()))
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

    private static void disconnect(StompSession session) {
        if (session != null && session.isConnected()) {
            session.disconnect();
        }
    }

    private static void waitUntil(
            BooleanSupplier condition
    ) throws InterruptedException {
        long deadline = System.nanoTime()
                + TimeUnit.SECONDS.toNanos(5);
        while (!condition.getAsBoolean()
                && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
        assertThat(condition.getAsBoolean()).isTrue();
    }

    private static String uuid() {
        return UUID.randomUUID().toString();
    }
}
