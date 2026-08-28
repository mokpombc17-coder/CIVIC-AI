package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.export.mongo.MongoChatExportJobDocument;
import com.hamcheeze.chat.export.mongo.MongoResearchChatExportJobDocument;
import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.security.CookieOrHeaderBearerTokenResolver;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.websocket.config.FixtureJwtProperties;
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
import java.io.ByteArrayInputStream;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipInputStream;

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
    private FixtureJwtProperties localJwtProperties;

    @Test
    void chatExportRequiresDedicatedAuditScope() throws Exception {
        String endpoint = "/api/v1/admin/rooms/missing-room/exports";
        String body = "{\"mode\":\"FULL\"}";

        mockMvc.perform(post(endpoint)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post(endpoint)
                        .with(jwt().jwt(token -> token.subject("admin-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_WRITE))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());

        mockMvc.perform(post(endpoint)
                        .with(jwt().jwt(token -> token.subject("admin-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .CHAT_AUDIT_EXPORTS))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ROOM_NOT_FOUND"));
    }

    @Test
    void exportRejectsBlankJwtSubjectWithoutCreatingJobs()
            throws Exception {
        long adminJobsBefore = mongoOperations.getCollection(
                        MongoChatExportJobDocument.COLLECTION_NAME)
                .countDocuments();
        long researchJobsBefore = mongoOperations.getCollection(
                        MongoResearchChatExportJobDocument.COLLECTION_NAME)
                .countDocuments();

        mockMvc.perform(post(
                        "/api/v1/research/rooms/missing-room/exports")
                        .with(jwt().jwt(token -> token.subject(" "))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .CHAT_RESEARCH_EXPORTS)))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.retryable").value(false));

        mockMvc.perform(post(
                        "/api/v1/admin/rooms/missing-room/exports")
                        .with(jwt().jwt(token -> token.subject(" "))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .CHAT_AUDIT_EXPORTS))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"FULL\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.retryable").value(false));

        assertThat(mongoOperations.getCollection(
                        MongoChatExportJobDocument.COLLECTION_NAME)
                .countDocuments()).isEqualTo(adminJobsBefore);
        assertThat(mongoOperations.getCollection(
                        MongoResearchChatExportJobDocument.COLLECTION_NAME)
                .countDocuments()).isEqualTo(researchJobsBefore);
    }

    @Test
    void researchExportRequiresItsOwnScopeAndNoMembership()
            throws Exception {
        String missing =
                "/api/v1/research/rooms/missing-room/exports";

        mockMvc.perform(post(missing))
                .andExpect(status().isUnauthorized());

        for (String disallowed : List.of(
                ChatScopes.ROOMS_READ,
                ChatScopes.ROOMS_WRITE,
                ChatScopes.CHAT_AUDIT_EXPORTS)) {
            mockMvc.perform(post(missing)
                            .with(jwt().jwt(token ->
                                            token.subject("researcher-1"))
                                    .authorities(
                                            new SimpleGrantedAuthority(
                                                    ChatScopes.authority(
                                                            disallowed)))))
                    .andExpect(status().isForbidden());
        }

        mockMvc.perform(post(missing)
                        .with(jwt().jwt(token ->
                                        token.subject("researcher-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .CHAT_RESEARCH_EXPORTS)))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ROOM_NOT_FOUND"));

        String roomId = "research-export-room";
        seedActiveRoom(roomId, "unrelated-owner");
        var result = mockMvc.perform(post("/api/v1/research/rooms/" + roomId
                        + "/exports")
                        .accept("application/zip")
                        .with(jwt().jwt(token ->
                                        token.subject("researcher-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .CHAT_RESEARCH_EXPORTS)))))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE,
                        "application/zip"))
                .andExpect(header().exists("X-Export-Id"))
                .andExpect(header().exists("X-Export-SHA256"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL,
                        "no-store, no-cache, must-revalidate"))
                .andExpect(header().string("Pragma", "no-cache"))
                .andExpect(header().string(
                        "X-Content-Type-Options", "nosniff"))
                .andReturn();

        byte[] zipBytes = result.getResponse().getContentAsByteArray();
        String exportId = result.getResponse().getHeader("X-Export-Id");
        assertThat(result.getResponse().getHeader(
                HttpHeaders.CONTENT_DISPOSITION)).isEqualTo(
                "attachment; filename=\"research-room-export-"
                        + exportId + ".zip\"");
        assertThat(result.getResponse().getContentLengthLong())
                .isEqualTo(zipBytes.length);
        assertThat(result.getResponse().getHeader("X-Export-SHA256"))
                .isEqualTo(HexFormat.of().formatHex(
                        MessageDigest.getInstance("SHA-256")
                                .digest(zipBytes)));
        Set<String> entries = new LinkedHashSet<>();
        try (ZipInputStream zip = new ZipInputStream(
                new ByteArrayInputStream(zipBytes),
                StandardCharsets.UTF_8)) {
            for (var entry = zip.getNextEntry(); entry != null;
                    entry = zip.getNextEntry()) {
                entries.add(entry.getName());
            }
        }
        assertThat(entries).containsExactly(
                "manifest.json", "messages.jsonl",
                "message_changes.jsonl", "transcript.html");

        String closedRoomId = "research-export-closed-room";
        seedActiveRoom(closedRoomId, "another-owner");
        mongoOperations.getCollection(MongoRoomDocument.COLLECTION_NAME)
                .updateOne(
                        new Document("_id", closedRoomId),
                        new Document("$set", new Document(
                                "status", "CLOSED")
                                .append("closedAt", Date.from(Instant.now()))
                                .append("activeMemberCount", 0))
                                .append("$inc", new Document("version", 1L)));
        mockMvc.perform(post("/api/v1/research/rooms/" + closedRoomId
                        + "/exports")
                        .with(jwt().jwt(token ->
                                        token.subject("researcher-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .CHAT_RESEARCH_EXPORTS)))))
                .andExpect(status().isOk());

        mockMvc.perform(post(
                        "/api/v1/admin/rooms/missing-room/exports")
                        .with(jwt().jwt(token ->
                                        token.subject("researcher-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .CHAT_RESEARCH_EXPORTS))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"FULL\"}"))
                .andExpect(status().isForbidden());
    }

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
    void creationRequestQueriesAndCancellationUseRoomScopes()
            throws Exception {
        String detail = "/api/v1/me/room-creation-requests/missing";

        mockMvc.perform(get(detail)
                        .with(jwt().jwt(token -> token.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_WRITE)))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(detail)
                        .with(jwt().jwt(token -> token.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_READ)))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(
                        "ROOM_CREATION_REQUEST_NOT_FOUND"));

        mockMvc.perform(post(detail + "/cancel")
                        .with(jwt().jwt(token -> token.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_READ)))))
                .andExpect(status().isForbidden());
        mockMvc.perform(post(detail + "/cancel")
                        .with(jwt().jwt(token -> token.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes.ROOMS_WRITE)))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(
                        "ROOM_CREATION_REQUEST_NOT_FOUND"));
    }

    @Test
    void activeRoomLimitPrecheckReturnsConflictWithoutPersistingRequest()
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
                .andExpect(jsonPath("$.replayed").value(false));

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

        mockMvc.perform(get("/api/v1/rooms/" + roomId
                        + "/read-receipts/state")
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .ROOMS_READ)))))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.roomId").value(roomId))
                .andExpect(jsonPath("$.roomVersion").isNumber())
                .andExpect(jsonPath("$.selfMembershipId").isString())
                .andExpect(jsonPath("$.positions.length()").value(1))
                .andExpect(jsonPath("$.positions[0].membershipId")
                        .isString())
                .andExpect(jsonPath("$.positions[0].membershipVersion")
                        .isNumber())
                .andExpect(jsonPath(
                        "$.positions[0].messageVisibleAfterSequence")
                        .value(0))
                .andExpect(jsonPath(
                        "$.positions[0].storedLastReadSequence")
                        .value(0))
                .andExpect(jsonPath("$.positions[0].userId")
                        .doesNotExist())
                .andExpect(jsonPath("$.positions[0].displayName")
                        .doesNotExist())
                .andExpect(jsonPath("$.positions[0].avatar")
                        .doesNotExist())
                .andExpect(jsonPath(
                        "$.positions[0].effectiveReadThroughSequence")
                        .doesNotExist());

        mockMvc.perform(get("/api/v1/rooms/" + roomId
                        + "/read-receipts/state")
                        .with(jwt().jwt(jwt -> jwt.subject("user-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .ROOMS_WRITE)))))
                .andExpect(status().isForbidden());

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
                .andExpect(jsonPath("$.items[0].categoryIds[0]")
                        .value(RoomCategoryDefaults.POLICY_CATEGORY_ID))
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
