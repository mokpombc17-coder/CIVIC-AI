package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.command.UnbanMemberCommand;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandReceiptDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RoomApiIntegrationTest extends MongoRuntimeIntegrationTest {

    private static final Pattern ROOM_ID = Pattern.compile(
            "\"roomId\":\"([^\"]+)\"");

    private static JwtRequestPostProcessor jwt() {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .authorities(
                        new SimpleGrantedAuthority(ChatScopes.authority(
                                ChatScopes.ROOMS_READ)),
                        new SimpleGrantedAuthority(ChatScopes.authority(
                                ChatScopes.ROOMS_WRITE)));
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RoomCommandService commandService;

    @Test
    void apiRequiresJwtWhileHealthAndWebSocketRemainPublic()
            throws Exception {
        mockMvc.perform(post("/api/v1/rooms")
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("OPEN")))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentType(
                        MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"));
        mockMvc.perform(post("/api/v1/rooms")
                        .header(
                                "Authorization",
                                "Bearer invalid-token")
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("OPEN")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());

        int webSocketStatus = mockMvc.perform(get("/ws"))
                .andReturn()
                .getResponse()
                .getStatus();
        assertThat(webSocketStatus).isNotEqualTo(401);
    }

    @Test
    void createUsesJwtSubjectAndReplaysCanonicalIdempotencyKey()
            throws Exception {
        String uppercaseKey =
                requestId().toUpperCase(Locale.ROOT);
        MvcResult first = mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", uppercaseKey)
                        .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                {
                                  "name":"  Test room  ",
                                  "visibility":"LISTED",
                                  "joinPolicy":"OPEN",
                                  "requesterUserId":"forged-user"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string(
                        "Location",
                        org.hamcrest.Matchers.startsWith(
                                "/api/v1/rooms/")))
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CREATED"))
                .andExpect(jsonPath("$.ownerUserId")
                        .value("owner-1"))
                .andExpect(jsonPath("$.clientRequestId")
                        .value(uppercaseKey.toLowerCase(Locale.ROOT)))
                .andExpect(jsonPath("$.replayed").value(false))
                .andReturn();
        String roomId = roomId(first);

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", uppercaseKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("OPEN")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roomId").value(roomId))
                .andExpect(jsonPath("$.replayed").value(true));

        assertThat(count(MongoRoomDocument.COLLECTION_NAME))
                .isEqualTo(1);
        assertThat(count(MongoMembershipDocument.COLLECTION_NAME))
                .isEqualTo(1);
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isEqualTo(1);
    }

    @Test
    void createConflictDoesNotExposeCandidateServerId()
            throws Exception {
        String key = requestId();
        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("OPEN")))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("INVITE_ONLY")))
                .andExpect(status().isConflict())
                .andExpect(content().contentType(
                        MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code")
                        .value("IDEMPOTENCY_CONFLICT"))
                .andExpect(jsonPath("$.roomId").doesNotExist())
                .andExpect(jsonPath("$.retryable").value(false));
    }

    @Test
    void invalidIdempotencyKeyAndBodyNeverMutate()
            throws Exception {
        for (String key : new String[]{"", "not-a-uuid"}) {
            mockMvc.perform(post("/api/v1/rooms")
                            .with(jwt().jwt(jwt ->
                                    jwt.subject("owner-1")))
                            .header("Idempotency-Key", key)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(createBody("OPEN")))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code")
                            .value("INVALID_IDEMPOTENCY_KEY"));
        }
        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("OPEN")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_IDEMPOTENCY_KEY"));
        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"));
        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Test room",
                                  "joinPolicy":"OPEN"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.fieldErrors[0].field")
                        .value("visibility"));

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":" ",
                                  "visibility":"LISTED",
                                  "joinPolicy":"OPEN"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.fieldErrors[0].field")
                        .value("name"));

        assertThat(count(MongoRoomDocument.COLLECTION_NAME)).isZero();
        assertThat(count(MongoMembershipDocument.COLLECTION_NAME))
                .isZero();
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isZero();
    }

    @Test
    void joinLeaveModerationAndCloseExposeStableHttpContracts()
            throws Exception {
        String roomId = createRoom("owner-1", JoinPolicy.OPEN);
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/join",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("JOINED"));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/join",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("ALREADY_ACTIVE"));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/ban-member",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUserId\":\"user-2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("BANNED"));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/ban-member",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUserId\":\"user-2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("ALREADY_BANNED"));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/join",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("MEMBERSHIP_BANNED"));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/unban-member",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUserId\":\"user-2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("UNBANNED"));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/unban-member",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUserId\":\"user-2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("ALREADY_UNBANNED"));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/join",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("REJOINED"));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/leave",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("LEFT"));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/leave",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("ALREADY_LEFT"));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/leave",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("OWNER_CANNOT_LEAVE"));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/close",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("CLOSED"));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/close",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("ALREADY_CLOSED"));
    }

    @Test
    void transferAndOwnerOnlyRejectionsUseHttpContract()
            throws Exception {
        String roomId = createRoom("owner-1", JoinPolicy.OPEN);
        commandService.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                roomId));

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/transfer-ownership",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUserId\":\"user-2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("OWNERSHIP_TRANSFERRED"))
                .andExpect(jsonPath("$.newOwnerUserId")
                        .value("user-2"));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/transfer-ownership",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUserId\":\"user-2\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("NOT_ROOM_OWNER"));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/transfer-ownership",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUserId\":\"missing\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("TARGET_MEMBERSHIP_NOT_FOUND"));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/ban-member",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUserId\":\"missing\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("NOT_ROOM_OWNER"));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/ban-member",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUserId\":\"missing\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("TARGET_MEMBERSHIP_NOT_FOUND"));
    }

    @Test
    void invitationOnlyJoinAndInvalidRoomIdAreDistinguished()
            throws Exception {
        String roomId = createRoom(
                "owner-1",
                JoinPolicy.INVITE_ONLY);
        String rejectedRequestId = requestId();

        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/join",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header(
                                "Idempotency-Key",
                                rejectedRequestId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("JOIN_POLICY_NOT_OPEN"))
                .andExpect(jsonPath("$.replayed").value(false));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/join",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header(
                                "Idempotency-Key",
                                rejectedRequestId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("JOIN_POLICY_NOT_OPEN"))
                .andExpect(jsonPath("$.replayed").value(true));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/join",
                                "invalid room!")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_ROOM_ID"));
        mockMvc.perform(post("/api/v1/rooms/{roomId}/commands/join",
                                "missing-room")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_NOT_FOUND"));
    }

    @Test
    void queryEndpointsCalculateParticipationFilterAndCursor()
            throws Exception {
        String roomId = createRoom("owner-1", JoinPolicy.OPEN);
        commandService.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                roomId));
        commandService.joinRoom(new JoinRoomCommand(
                "user-3",
                requestId(),
                roomId));
        commandService.banMember(new BanMemberCommand(
                "owner-1",
                requestId(),
                roomId,
                "user-3"));

        mockMvc.perform(get("/api/v1/rooms/{roomId}", roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2"))))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        org.hamcrest.Matchers.containsString(
                                "no-store")))
                .andExpect(jsonPath("$.participationStatus")
                        .value("ACTIVE"))
                .andExpect(jsonPath("$.name")
                        .value("Test room"))
                .andExpect(jsonPath("$.myMembership.userId")
                        .value("user-2"));
        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/memberships/me",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("missing-user"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("MEMBERSHIP_NOT_FOUND"));
        mockMvc.perform(get("/api/v1/me/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].roomId")
                        .value(roomId))
                .andExpect(jsonPath("$.items[0].name")
                        .value("Test room"));
        MvcResult firstPage = mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/memberships",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .queryParam("status", "ACTIVE")
                        .queryParam("limit", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.hasNext").value(true))
                .andReturn();
        String cursor = jsonString(
                firstPage,
                "nextCursor");
        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/memberships",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .queryParam("status", "ACTIVE")
                        .queryParam("limit", "1")
                        .queryParam("cursor", cursor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.hasNext").value(false));
        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/memberships",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("NOT_ROOM_OWNER"));
        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/memberships",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .queryParam("cursor", "invalid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_CURSOR"));
        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/memberships",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .queryParam("status", "BANNED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].userId")
                        .value("user-3"));
        mockMvc.perform(get("/api/v1/me/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .queryParam("limit", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"));
    }

    @Test
    void exactUnlistedAndClosedRoomQueriesRemainAvailable()
            throws Exception {
        String roomId = commandService.createRoom(
                        new CreateRoomCommand(
                                "owner-1",
                                requestId(),
                                "Unlisted room",
                                RoomVisibility.UNLISTED,
                                JoinPolicy.OPEN))
                .result()
                .roomId();

        mockMvc.perform(get("/api/v1/rooms/{roomId}", roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("not-a-member"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility")
                        .value("UNLISTED"))
                .andExpect(jsonPath("$.participationStatus")
                        .value("NOT_JOINED"));
        mockMvc.perform(get("/api/v1/rooms/missing-room")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_NOT_FOUND"));
        commandService.closeRoom(new CloseRoomCommand(
                "owner-1",
                requestId(),
                roomId));

        mockMvc.perform(get("/api/v1/rooms/{roomId}", roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.participationStatus")
                        .value("ROOM_CLOSED"))
                .andExpect(jsonPath("$.myMembership.role")
                        .value("OWNER"))
                .andExpect(jsonPath("$.myMembership.status")
                        .value("LEFT"));
        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/memberships",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .queryParam("status", "LEFT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].role")
                        .value("OWNER"));
    }

    @Test
    void currentRoomsExcludeLeftBannedAndClosedRelationships()
            throws Exception {
        String activeRoom = createRoom("owner-a", JoinPolicy.OPEN);
        String leftRoom = createRoom("owner-b", JoinPolicy.OPEN);
        String bannedRoom = createRoom("owner-c", JoinPolicy.OPEN);
        String closedRoom = createRoom("owner-d", JoinPolicy.OPEN);
        for (String roomId : new String[]{
                activeRoom,
                leftRoom,
                bannedRoom,
                closedRoom}) {
            commandService.joinRoom(new JoinRoomCommand(
                    "user-1",
                    requestId(),
                    roomId));
        }
        commandService.leaveRoom(new LeaveRoomCommand(
                "user-1",
                requestId(),
                leftRoom));
        commandService.banMember(new BanMemberCommand(
                "owner-c",
                requestId(),
                bannedRoom,
                "user-1"));
        commandService.leaveRoom(new LeaveRoomCommand(
                "user-1",
                requestId(),
                closedRoom));
        commandService.closeRoom(new CloseRoomCommand(
                "owner-d",
                requestId(),
                closedRoom));

        mockMvc.perform(get("/api/v1/me/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomId")
                        .value(activeRoom));
    }

    private String createRoom(
            String owner,
            JoinPolicy joinPolicy
    ) {
        return commandService.createRoom(new CreateRoomCommand(
                        owner,
                        requestId(),
                        "Test room",
                        RoomVisibility.LISTED,
                        joinPolicy))
                .result()
                .roomId();
    }

    private long count(String collection) {
        return mongoOperations.getCollection(collection)
                .countDocuments();
    }

    private String roomId(MvcResult result) throws Exception {
        Matcher matcher = ROOM_ID.matcher(
                result.getResponse().getContentAsString());
        assertThat(matcher.find()).isTrue();
        return matcher.group(1);
    }

    private String jsonString(
            MvcResult result,
            String field
    ) throws Exception {
        Pattern pattern = Pattern.compile(
                "\"" + field + "\":\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(
                result.getResponse().getContentAsString());
        assertThat(matcher.find()).isTrue();
        return matcher.group(1);
    }

    private String createBody(String joinPolicy) {
        return """
                {
                  "name":"Test room",
                  "visibility":"LISTED",
                  "joinPolicy":"%s"
                }
                """.formatted(joinPolicy);
    }

    private String requestId() {
        return UUID.randomUUID().toString();
    }
}
