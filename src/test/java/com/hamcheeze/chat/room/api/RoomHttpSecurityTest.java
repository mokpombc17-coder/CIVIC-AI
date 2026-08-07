package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.security.CookieOrHeaderBearerTokenResolver;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.websocket.config.LocalJwtProperties;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import jakarta.servlet.http.Cookie;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RoomHttpSecurityTest extends MongoRuntimeIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LocalJwtProperties localJwtProperties;

    @Test
    void roomApiRequiresWriteScopeAndAcceptsJwtSubject()
            throws Exception {
        mockMvc.perform(post("/api/v1/rooms")
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"));

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                        jwt.subject("jwt-user"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_WRITE))))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.ownerMembershipId").isString())
                .andExpect(jsonPath("$.ownerUserId").doesNotExist());

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                        jwt.subject("jwt-user"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_READ))))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                        jwt.subject(" "))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_WRITE))))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"));
    }

    @Test
    void activeRoomLimitReturnsConflictAndReplaysWithoutLimitValue()
            throws Exception {
        seedActiveRooms("limited-user", 20);
        String createRequestId = UUID.randomUUID().toString();

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt -> jwt.subject(
                                        "limited-user"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .ROOMS_WRITE))))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                createRequestId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(
                        "USER_ACTIVE_ROOM_LIMIT_EXCEEDED"))
                .andExpect(jsonPath("$.retryable").value(false))
                .andExpect(jsonPath("$.replayed").value(false))
                .andExpect(jsonPath("$.detail").value(
                        "The user has reached the active room limit."));

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt -> jwt.subject(
                                        "limited-user"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .ROOMS_WRITE))))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                createRequestId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(
                        "USER_ACTIVE_ROOM_LIMIT_EXCEEDED"))
                .andExpect(jsonPath("$.replayed").value(true));

        String targetRoom = "quota-join-target";
        seedActiveRoom(targetRoom, "target-owner");
        mockMvc.perform(post(
                        "/api/v1/rooms/{roomId}/commands/join",
                        targetRoom)
                        .with(jwt().jwt(jwt -> jwt.subject(
                                        "limited-user"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .ROOMS_WRITE))))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(
                        "USER_ACTIVE_ROOM_LIMIT_EXCEEDED"));
    }

    @Test
    void exemptionScopeBypassesOnlyUserLimit() throws Exception {
        seedActiveRooms("exempt-user", 20);

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt -> jwt.subject(
                                        "exempt-user"))
                                .authorities(
                                        new SimpleGrantedAuthority(
                                                ChatScopes.authority(
                                                        ChatScopes
                                                                .ROOMS_WRITE)),
                                        new SimpleGrantedAuthority(
                                                ChatScopes.authority(
                                                        ChatScopes
                                                                .ROOM_MEMBERSHIP_LIMIT_EXEMPT))))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt -> jwt.subject(
                                        "scope-only-user"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .ROOM_MEMBERSHIP_LIMIT_EXEMPT))))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isForbidden());
    }

    @Test
    void authenticatesSignedLocalJwtFromHttpOnlyCookie()
            throws Exception {
        String token = token(
                "local-user-1",
                List.of(ChatScopes.ROOMS_WRITE));

        mockMvc.perform(post("/api/v1/rooms")
                        .cookie(new Cookie(
                                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                                token))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.ownerMembershipId").isString())
                .andExpect(jsonPath("$.ownerUserId").doesNotExist());
    }

    @Test
    void rejectsDifferentHeaderAndCookieTokens()
            throws Exception {
        String headerToken = token(
                "header-user",
                List.of(ChatScopes.ROOMS_WRITE));
        String cookieToken = token(
                "cookie-user",
                List.of(ChatScopes.ROOMS_WRITE));

        mockMvc.perform(post("/api/v1/rooms")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                "Bearer " + headerToken)
                        .cookie(new Cookie(
                                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                                cookieToken))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void allowsCredentialCorsOnlyFromFrontendOrigin()
            throws Exception {
        mockMvc.perform(options("/api/v1/rooms")
                        .header(
                                HttpHeaders.ORIGIN,
                                "http://localhost:3000")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD,
                                "POST")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                                "content-type,idempotency-key"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN,
                        "http://localhost:3000"))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS,
                        "true"))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS,
                        org.hamcrest.Matchers.allOf(
                                org.hamcrest.Matchers
                                        .containsString("GET"),
                                org.hamcrest.Matchers
                                        .containsString("POST"),
                                org.hamcrest.Matchers
                                        .containsString("OPTIONS"))))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS,
                        org.hamcrest.Matchers.allOf(
                                org.hamcrest.Matchers
                                        .containsStringIgnoringCase(
                                                "content-type"),
                                org.hamcrest.Matchers
                                        .containsStringIgnoringCase(
                                                "idempotency-key"))));

        mockMvc.perform(options(
                                "/api/v1/rooms/room-1/messages")
                        .header(
                                HttpHeaders.ORIGIN,
                                "http://localhost:3000")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD,
                                "GET")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                                "authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN,
                        "http://localhost:3000"))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS,
                        "true"))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS,
                        org.hamcrest.Matchers.containsString("GET")))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS,
                        org.hamcrest.Matchers
                                .containsStringIgnoringCase(
                                        "authorization")));

        mockMvc.perform(options("/api/v1/rooms")
                        .header(
                                HttpHeaders.ORIGIN,
                                "http://evil.example")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD,
                                "POST"))
                .andExpect(status().isForbidden());

        mockMvc.perform(options("/api/v1/rooms")
                        .header(
                                HttpHeaders.ORIGIN,
                                "http://localhost:3000")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD,
                                "POST")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                                "x-forbidden-header"))
                .andExpect(status().isForbidden());
    }

    @Test
    void healthAndWebSocketHandshakeRemainPermitAll()
            throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());
        int status = mockMvc.perform(get("/ws"))
                .andReturn()
                .getResponse()
                .getStatus();
        assertThat(status).isNotEqualTo(401);
    }

    @Test
    void websocketHandshakeDefersInvalidCookieAuthenticationToStompConnect()
            throws Exception {
        int malformedStatus = mockMvc.perform(get("/ws")
                        .cookie(new Cookie(
                                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                                "not-a-jwt")))
                .andReturn()
                .getResponse()
                .getStatus();
        String expiredToken = token(
                "local-user-1",
                List.of(ChatScopes.CONNECT),
                Instant.now().minusSeconds(60));
        int expiredStatus = mockMvc.perform(get("/ws")
                        .cookie(new Cookie(
                                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                                expiredToken)))
                .andReturn()
                .getResponse()
                .getStatus();

        assertThat(malformedStatus).isNotEqualTo(401);
        assertThat(expiredStatus).isNotEqualTo(401);
    }

    @Test
    void readStateUsesDedicatedScopeAndRoomInboxUsesReadScope()
            throws Exception {
        String body = "{\"throughSequence\":0}";
        String createResponse = mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_WRITE))))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody()))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String roomId = createResponse.replaceFirst(
                ".*\\\"roomId\\\":\\\"([^\\\"]+)\\\".*",
                "$1");

        mockMvc.perform(put("/api/v1/rooms/" + roomId + "/read-state")
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .READ_STATE_WRITE))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.readThroughSequence").value(0))
                .andExpect(jsonPath("$.updated").value(false));

        mockMvc.perform(put("/api/v1/rooms/room-1/read-state")
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_WRITE))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/v1/rooms/room-1/read-state")
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .READ_STATE_WRITE))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        mockMvc.perform(get("/api/v1/me/room-inbox")
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_READ)))))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items[0].categories[0]")
                        .value("POLICY"))
                .andExpect(jsonPath("$.items[0]")
                        .value(hasKey("lastMessage")))
                .andExpect(jsonPath("$.items[0].lastMessage")
                        .value(nullValue()))
                .andExpect(jsonPath("$.items[0].lastActivityAt")
                        .exists());

        mockMvc.perform(get("/api/v1/me/room-inbox?limit=21")
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_READ)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"));

        mockMvc.perform(get("/api/v1/me/room-inbox")
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_WRITE)))))
                .andExpect(status().isForbidden());
    }

    @Test
    void roomInboxFailsClosedForUnsupportedSummaryWithoutRepair()
            throws Exception {
        String roomId = "room-summary-inconsistent";
        seedActiveRoom(roomId, "user-1");
        Document raw = new Document("_id", roomId)
                .append("schemaVersion", 2)
                .append("lastMessage", new Document(
                        "messageId", "message-secret")
                        .append("roomSequence", 1L)
                        .append("messageVersion", 1L)
                        .append("state", "ACTIVE")
                        .append("preview", "secret-preview")
                        .append("previewTruncated", false)
                        .append("createdAt", Date.from(Instant.parse(
                                "2026-08-04T08:30:00Z"))))
                .append("lastActivityAt", Date.from(Instant.parse(
                        "2026-08-04T08:30:00Z")))
                .append("updatedAt", Date.from(Instant.parse(
                        "2026-08-04T08:30:00Z")));
        mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .insertOne(raw);

        String response = mockMvc.perform(get("/api/v1/me/room-inbox")
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_READ)))))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(
                        "ROOM_INBOX_SUMMARY_INCONSISTENT"))
                .andExpect(jsonPath("$.retryable").value(false))
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(response).doesNotContain(
                "secret-preview", "message-secret", "raw BSON");
        assertThat(mongoOperations.getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .find(new Document("_id", roomId))
                .first()).isEqualTo(raw);
    }

    @Test
    void roomInboxRejectsSubMillisecondCursorAsInvalidRequest()
            throws Exception {
        String cursor = roomInboxCursorToken("""
                {"version":2,"scope":"MY_ROOM_INBOX",
                "lastActivityAt":"2026-08-04T08:30:00.123000001Z",
                "lastRoomId":"room-A"}
                """);

        mockMvc.perform(get("/api/v1/me/room-inbox")
                        .param("cursor", cursor)
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_READ)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURSOR"))
                .andExpect(jsonPath("$.retryable").value(false));
    }

    @Test
    void allowsReadStatePutCorsPreflight() throws Exception {
        mockMvc.perform(options("/api/v1/rooms/room-1/read-state")
                        .header(HttpHeaders.ORIGIN,
                                "http://localhost:3000")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD,
                                "PUT")
                        .header(
                                HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
                                "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS,
                        org.hamcrest.Matchers.containsString("PUT")));
    }

    private String createBody() {
        return """
                {
                  "name":"Test room",
                  "categories":["POLICY"],
                  "visibility":"LISTED",
                  "joinPolicy":"OPEN"
                }
                """;
    }

    private void seedActiveRooms(String userId, int count) {
        for (int index = 0; index < count; index++) {
            seedActiveRoom("quota-room-" + index, userId);
        }
    }

    private static String roomInboxCursorToken(String payload) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(payload.getBytes(
                        StandardCharsets.UTF_8));
    }

    private String token(
            String subject,
            List<String> scopes
    ) throws Exception {
        return token(
                subject,
                scopes,
                Instant.now().plusSeconds(3_600));
    }

    private String token(
            String subject,
            List<String> scopes,
            Instant expirationTime
    ) throws Exception {
        Instant now = Instant.now();
        SignedJWT jwt = new SignedJWT(
                new JWSHeader(JWSAlgorithm.HS256),
                new JWTClaimsSet.Builder()
                        .subject(subject)
                        .issuer(localJwtProperties.getIssuer())
                        .audience(localJwtProperties.getAudience())
                        .claim("scope", String.join(" ", scopes))
                        .issueTime(Date.from(now.minusSeconds(1)))
                        .expirationTime(Date.from(expirationTime))
                        .jwtID(UUID.randomUUID().toString())
                        .build());
        jwt.sign(new MACSigner(localJwtProperties.getSecret()
                .getBytes(StandardCharsets.UTF_8)));
        return jwt.serialize();
    }
}
