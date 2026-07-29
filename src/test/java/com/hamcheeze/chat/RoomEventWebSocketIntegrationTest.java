package com.hamcheeze.chat;

import com.hamcheeze.chat.security.CookieOrHeaderBearerTokenResolver;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.websocket.config.LocalJwtProperties;
import com.hamcheeze.chat.websocket.subscription.ChatSubscriptionRegistry;
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

    @Test
    void publishesSamePublicEnvelopeToRoomAndAffectedUser()
            throws Exception {
        RoomCommandExecution created = commandService.createRoom(
                new CreateRoomCommand(
                        "owner-1",
                        uuid(),
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
                    .isEqualTo(1);
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
                    .get("userId")
                    .asText())
                    .isEqualTo("user-2");
            String publicJson = new String(
                    roomBytes,
                    StandardCharsets.UTF_8);
            assertThat(publicJson)
                    .contains("\"userId\":\"user-2\"")
                    .doesNotContain("owner-1")
                    .doesNotContain("clientRequestId");
        } finally {
            disconnect(ownerSession);
            disconnect(memberSession);
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
