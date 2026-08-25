package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.RoomMembershipProperties;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.command.UnbanMemberCommand;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryPort;
import com.hamcheeze.chat.room.creation.mongo.MongoRoomCreationRequestDocument;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.json.JsonMapper;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verifyNoInteractions;
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
    private static final JsonMapper JSON =
            JsonMapper.builder().build();

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

    @Autowired
    private RoomMembershipProperties membershipProperties;

    @MockitoSpyBean
    private RoomEventDeliveryPort eventDeliveryPort;

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
                                  "categories":["POLICY"],
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
                .andExpect(jsonPath("$.creationRequestId").isString())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.requestedAt").isString())
                .andExpect(jsonPath("$.resolvedAt").isString())
                .andExpect(jsonPath("$.ownerMembershipId").isString())
                .andExpect(jsonPath("$.ownerUserId").doesNotExist())
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
                .isZero();
        assertThat(count(
                MongoRoomCreationRequestDocument.COLLECTION_NAME))
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
    void createDescriptionAndUpdateSettingsExposeStableHttpContract()
            throws Exception {
        MvcResult created = mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-settings")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Settings room",
                                  "description":" Initial description ",
                                  "categories":["POLICY"],
                                  "visibility":"LISTED",
                                  "joinPolicy":"OPEN"
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        String roomId = roomId(created);
        String ownerMembershipId = jsonString(
                created,
                "ownerMembershipId");

        mockMvc.perform(get("/api/v1/rooms/{roomId}", roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-settings"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.description")
                        .value("Initial description"))
                .andExpect(jsonPath("$.ownerMembershipId")
                        .value(ownerMembershipId))
                .andExpect(jsonPath("$.ownerUserId").doesNotExist())
                .andExpect(jsonPath("$.myMembership.userId")
                        .doesNotExist())
                .andExpect(jsonPath("$.categories[0]")
                        .value("POLICY"));
        mockMvc.perform(get("/api/v1/me/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-settings"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].description")
                        .value("Initial description"))
                .andExpect(jsonPath("$.items[0].ownerMembershipId")
                        .value(ownerMembershipId))
                .andExpect(jsonPath("$.items[0].ownerUserId")
                        .doesNotExist())
                .andExpect(jsonPath("$.items[0].categories[0]")
                        .value("POLICY"));
        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-settings"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].description")
                        .value("Initial description"))
                .andExpect(jsonPath("$.items[0].ownerMembershipId")
                        .value(ownerMembershipId))
                .andExpect(jsonPath("$.items[0].ownerUserId")
                        .doesNotExist())
                .andExpect(jsonPath("$.items[0].categories[0]")
                        .value("POLICY"));
        MvcResult inboxBeforeUpdate = mockMvc.perform(
                        get("/api/v1/me/room-inbox")
                                .with(jwt().jwt(jwt -> jwt.subject(
                                        "owner-settings"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].ownerMembershipId")
                        .value(ownerMembershipId))
                .andExpect(jsonPath("$.items[0].ownerUserId")
                        .doesNotExist())
                .andExpect(jsonPath("$.items[0].categories[0]")
                        .value("POLICY"))
                .andReturn();
        String lastActivityBeforeUpdate = jsonString(
                inboxBeforeUpdate,
                "lastActivityAt");

        String updateKey = requestId();
        String updateBody = """
                {
                  "name":"  Updated room  ",
                  "description":"Updated description",
                  "categories":["ENVIRONMENT"],
                  "visibility":"UNLISTED",
                  "joinPolicy":"INVITE_ONLY"
                }
                """;
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/commands/update-settings",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-settings")))
                        .header("Idempotency-Key", updateKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_SETTINGS_UPDATED"))
                .andExpect(jsonPath("$.replayed").value(false))
                .andExpect(jsonPath("$.name").value("Updated room"))
                .andExpect(jsonPath("$.description")
                        .value("Updated description"))
                .andExpect(jsonPath("$.categories[0]")
                        .value("ENVIRONMENT"))
                .andExpect(jsonPath("$.visibility")
                        .value("UNLISTED"))
                .andExpect(jsonPath("$.joinPolicy")
                        .value("INVITE_ONLY"))
                .andExpect(jsonPath("$.roomVersion").value(1));

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/commands/update-settings",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-settings")))
                        .header("Idempotency-Key", updateKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_SETTINGS_UPDATED"))
                .andExpect(jsonPath("$.replayed").value(true))
                .andExpect(jsonPath("$.roomVersion").value(1));

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/commands/update-settings",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-settings")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_SETTINGS_UNCHANGED"))
                .andExpect(jsonPath("$.roomVersion").value(1));

        mockMvc.perform(get("/api/v1/rooms/{roomId}", roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-settings"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated room"))
                .andExpect(jsonPath("$.description")
                        .value("Updated description"))
                .andExpect(jsonPath("$.categories[0]")
                        .value("ENVIRONMENT"))
                .andExpect(jsonPath("$.visibility")
                        .value("UNLISTED"))
                .andExpect(jsonPath("$.joinPolicy")
                        .value("INVITE_ONLY"))
                .andExpect(jsonPath("$.version").value(1));
        mockMvc.perform(get("/api/v1/me/room-inbox")
                        .with(jwt().jwt(jwt -> jwt.subject(
                                "owner-settings"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].categories[0]")
                        .value("ENVIRONMENT"))
                .andExpect(jsonPath("$.items[0].lastActivityAt")
                        .value(lastActivityBeforeUpdate));
        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-settings"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/commands/join",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("another-user")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("JOIN_POLICY_NOT_OPEN"));

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/commands/update-settings",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("another-user")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\"\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("NOT_ROOM_OWNER"));
    }

    @Test
    void updateSettingsRejectsInvalidPatchValues()
            throws Exception {
        String roomId = createRoom("owner-1", JoinPolicy.OPEN);

        for (String body : new String[]{
                "{}",
                "{\"unknown\":\"value\"}",
                "{\"name\":null}",
                "{\"description\":null}",
                "{\"visibility\":null}",
                "{\"joinPolicy\":null}",
                "{\"visibility\":\"INVALID\"}",
                "{\"joinPolicy\":\"INVALID\"}",
                JSON.writeValueAsString(Map.of(
                        "description",
                        "\u000bdescription"))}) {
            mockMvc.perform(post(
                                    "/api/v1/rooms/{roomId}/commands/update-settings",
                                    roomId)
                            .with(jwt().jwt(jwt ->
                                    jwt.subject("owner-1")))
                            .header("Idempotency-Key", requestId())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code")
                            .value("INVALID_REQUEST"));
        }

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/commands/update-settings",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_SETTINGS_UNCHANGED"));
    }

    @Test
    void forbiddenBoundaryControlsNeverMutateCreateOrUpdate()
            throws Exception {
        String[] invalidDescriptions = {
                "\u000bdescription",
                "description\u000c",
                "description\u001ctext"
        };
        for (String description : invalidDescriptions) {
            mockMvc.perform(post("/api/v1/rooms")
                            .with(jwt().jwt(jwt ->
                                    jwt.subject("owner-c0")))
                            .header(
                                    "Idempotency-Key",
                                    requestId())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(JSON.writeValueAsString(Map.of(
                                    "name",
                                    "Control room",
                                    "description",
                                    description,
                                    "visibility",
                                    "LISTED",
                                    "joinPolicy",
                                    "OPEN"))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code")
                            .value("INVALID_REQUEST"));
        }
        assertThat(count(MongoRoomDocument.COLLECTION_NAME)).isZero();
        assertThat(count(MongoMembershipDocument.COLLECTION_NAME))
                .isZero();
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isZero();

        String roomId = createRoom("owner-c0", JoinPolicy.OPEN);
        long receiptCount = count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME);
        long version = mongoOperations.findById(
                roomId,
                MongoRoomDocument.class).version();
        clearInvocations(eventDeliveryPort);

        for (String description : invalidDescriptions) {
            mockMvc.perform(post(
                                    "/api/v1/rooms/{roomId}/commands/update-settings",
                                    roomId)
                            .with(jwt().jwt(jwt ->
                                    jwt.subject("owner-c0")))
                            .header(
                                    "Idempotency-Key",
                                    requestId())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(JSON.writeValueAsString(Map.of(
                                    "description",
                                    description))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code")
                            .value("INVALID_REQUEST"));
        }

        assertThat(mongoOperations.findById(
                roomId,
                MongoRoomDocument.class).version())
                .isEqualTo(version);
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isEqualTo(receiptCount);
        verifyNoInteractions(eventDeliveryPort);
    }

    @Test
    void updateSettingsKeepsInvalidIdempotencyKeyContract()
            throws Exception {
        String roomId = createRoom("owner-1", JoinPolicy.OPEN);

        assertInvalidUpdateIdempotencyKey(roomId, null);
        assertInvalidUpdateIdempotencyKey(roomId, "");
        assertInvalidUpdateIdempotencyKey(roomId, "not-a-uuid");
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
                                  "categories":["POLICY"],
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
                                  "categories":["POLICY"],
                                  "visibility":"LISTED",
                                  "joinPolicy":"OPEN"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.fieldErrors[0].field")
                        .value("name"));

        mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"Test room",
                                  "visibility":"LISTED",
                                  "joinPolicy":"OPEN"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.fieldErrors[0].field")
                        .value("categories"));

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
        MvcResult joined = mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/commands/join",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("JOINED"))
                .andExpect(jsonPath("$.membershipUserId")
                        .doesNotExist())
                .andReturn();
        String targetMembershipId =
                jsonString(joined, "membershipId");
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
                        .content("{\"targetMembershipId\":\""
                                + targetMembershipId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("BANNED"))
                .andExpect(jsonPath("$.targetMembershipId")
                        .value(targetMembershipId))
                .andExpect(jsonPath("$.targetUserId")
                        .doesNotExist());
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/ban-member",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetMembershipId\":\""
                                + targetMembershipId + "\"}"))
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
                        .content("{\"targetMembershipId\":\""
                                + targetMembershipId + "\"}"))
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
                        .content("{\"targetMembershipId\":\""
                                + targetMembershipId + "\"}"))
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
                .andExpect(jsonPath("$.code").value("CLOSED"))
                .andExpect(jsonPath("$.ownerUserId").doesNotExist());
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
    void targetCommandsRequireNonBlankMembershipId()
            throws Exception {
        String roomId = createRoom("owner-1", JoinPolicy.OPEN);
        for (String command : new String[]{
                "transfer-ownership",
                "ban-member",
                "unban-member"}) {
            for (String body : new String[]{
                    "{}",
                    "{\"targetMembershipId\":\" \"}",
                    "{\"targetUserId\":\"user-2\"}"}) {
                mockMvc.perform(post(
                                        "/api/v1/rooms/{roomId}"
                                                + "/commands/{command}",
                                        roomId,
                                        command)
                                .with(jwt().jwt(jwt ->
                                        jwt.subject("owner-1")))
                                .header(
                                        "Idempotency-Key",
                                        requestId())
                                .contentType(
                                        MediaType.APPLICATION_JSON)
                                .content(body))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code")
                                .value("INVALID_REQUEST"));
            }
        }
    }

    @Test
    void transferAndOwnerOnlyRejectionsUseHttpContract()
            throws Exception {
        String roomId = createRoom("owner-1", JoinPolicy.OPEN);
        String targetMembershipId = commandService.joinRoom(
                        new JoinRoomCommand(
                "user-2",
                requestId(),
                roomId))
                .result()
                .membershipId();

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/transfer-ownership",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetMembershipId\":\""
                                + targetMembershipId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code")
                        .value("OWNERSHIP_TRANSFERRED"))
                .andExpect(jsonPath("$.newOwnerMembershipId")
                        .value(targetMembershipId))
                .andExpect(jsonPath("$.previousOwnerUserId")
                        .doesNotExist())
                .andExpect(jsonPath("$.newOwnerUserId")
                        .doesNotExist());
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/transfer-ownership",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUserId\":\"user-2\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}"
                                        + "/commands/transfer-ownership",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .header("Idempotency-Key", requestId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetMembershipId\":"
                                + "\"missing\"}"))
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
                        .content("{\"targetMembershipId\":"
                                + "\"missing\"}"))
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
                        .content("{\"targetMembershipId\":"
                                + "\"missing\"}"))
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
    void memberLimitUsesConflictContractAndProducesNoEvent()
            throws Exception {
        membershipProperties.setMaxActiveMembersPerRoom(2);
        try {
            String roomId = createRoom(
                    "owner-1",
                    JoinPolicy.OPEN);
            commandService.joinRoom(new JoinRoomCommand(
                    "user-2",
                    requestId(),
                    roomId));
            membershipProperties.setMaxActiveMembersPerRoom(1);

            mockMvc.perform(get("/api/v1/rooms/{roomId}", roomId)
                            .with(jwt().jwt(jwt ->
                                    jwt.subject("owner-1"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.activeMemberCount")
                            .value(2));
            mockMvc.perform(post(
                            "/api/v1/rooms/{roomId}/commands/join",
                            roomId)
                            .with(jwt().jwt(jwt ->
                                    jwt.subject("user-2")))
                            .header("Idempotency-Key", requestId()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code")
                            .value("ALREADY_ACTIVE"));

            String requestId = requestId();
            var roomBefore = roomStore.findById(roomId).orElseThrow();
            clearInvocations(eventDeliveryPort);

            mockMvc.perform(post(
                            "/api/v1/rooms/{roomId}/commands/join",
                            roomId)
                            .with(jwt().jwt(jwt ->
                                    jwt.subject("user-3")))
                            .header("Idempotency-Key", requestId))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value(
                            "ROOM_MEMBER_LIMIT_EXCEEDED"))
                    .andExpect(jsonPath("$.detail").value(
                            "The room has reached its active "
                                    + "member limit."))
                    .andExpect(jsonPath("$.replayed").value(false));
            mockMvc.perform(post(
                            "/api/v1/rooms/{roomId}/commands/join",
                            roomId)
                            .with(jwt().jwt(jwt ->
                                    jwt.subject("user-3")))
                            .header("Idempotency-Key", requestId))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value(
                            "ROOM_MEMBER_LIMIT_EXCEEDED"))
                    .andExpect(jsonPath("$.replayed").value(true));

            assertThat(roomStore.findById(roomId))
                    .contains(roomBefore);
            assertThat(membershipStore.findByRoomIdAndUserId(
                    roomId,
                    "user-3")).isEmpty();
            assertThat(count(MongoMembershipDocument.COLLECTION_NAME))
                    .isEqualTo(2);
            assertThat(count(
                    MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                    .isEqualTo(4);
            verifyNoInteractions(eventDeliveryPort);
        } finally {
            membershipProperties.setMaxActiveMembersPerRoom(50);
        }
    }

    @Test
    void queryEndpointsCalculateParticipationFilterAndCursor()
            throws Exception {
        String roomId = createRoom("owner-1", JoinPolicy.OPEN);
        commandService.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                roomId));
        String user3MembershipId = commandService.joinRoom(
                new JoinRoomCommand(
                "user-3",
                requestId(),
                roomId)).result().membershipId();
        commandService.banMember(new BanMemberCommand(
                "owner-1",
                requestId(),
                roomId,
                user3MembershipId));

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
                .andExpect(jsonPath("$.myMembership.membershipId")
                        .isString())
                .andExpect(jsonPath("$.myMembership.userId")
                        .doesNotExist());
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
                .andExpect(jsonPath("$.items[0].displayName")
                        .isString())
                .andExpect(jsonPath("$.items[0].imageUrl")
                        .value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.items[0].profileVersion")
                        .value(1))
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
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()")
                        .value(2))
                .andExpect(jsonPath("$.items[*].displayName")
                        .value(org.hamcrest.Matchers.containsInAnyOrder(
                                "참여자 1",
                                "참여자 2")))
                .andExpect(jsonPath("$.items[*].profileVersion")
                        .value(org.hamcrest.Matchers.everyItem(
                                org.hamcrest.Matchers.is(1))))
                .andExpect(jsonPath("$.items[0].userId")
                        .doesNotExist());
        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/memberships",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2")))
                        .queryParam("status", "BANNED"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("NOT_ROOM_OWNER"));
        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/memberships",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("missing-user"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("ACCESS_DENIED"));
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
                .andExpect(jsonPath("$.items[0].membershipId")
                        .value(user3MembershipId))
                .andExpect(jsonPath("$.items[0].userId")
                        .doesNotExist());
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
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
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
        commandService.joinRoom(new JoinRoomCommand(
                "user-1", requestId(), activeRoom));
        commandService.joinRoom(new JoinRoomCommand(
                "user-1", requestId(), leftRoom));
        String bannedMembershipId = commandService.joinRoom(
                new JoinRoomCommand(
                        "user-1",
                        requestId(),
                        bannedRoom)).result().membershipId();
        commandService.joinRoom(new JoinRoomCommand(
                "user-1", requestId(), closedRoom));
        commandService.leaveRoom(new LeaveRoomCommand(
                "user-1",
                requestId(),
                leftRoom));
        commandService.banMember(new BanMemberCommand(
                "owner-c",
                requestId(),
                bannedRoom,
                bannedMembershipId));
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

    @Test
    void readReceiptSnapshotReturnsOnlyActiveMembershipRawPositions()
            throws Exception {
        String roomId = createRoom("owner-1", JoinPolicy.OPEN);
        String ownerMembershipId = membershipStore
                .findByRoomIdAndUserId(roomId, "owner-1")
                .orElseThrow()
                .membershipId();
        String memberMembershipId = commandService.joinRoom(
                new JoinRoomCommand(
                        "user-2", requestId(), roomId))
                .result()
                .membershipId();
        String bannedMembershipId = commandService.joinRoom(
                new JoinRoomCommand(
                        "user-3", requestId(), roomId))
                .result()
                .membershipId();
        commandService.banMember(new BanMemberCommand(
                "owner-1", requestId(), roomId, bannedMembershipId));

        java.util.List<String> expectedMembershipIds =
                java.util.stream.Stream.of(
                                ownerMembershipId,
                                memberMembershipId)
                        .sorted()
                        .toList();
        MvcResult snapshot = mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}"
                                        + "/read-receipts/state",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1"))))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        org.hamcrest.Matchers.containsString(
                                "no-store")))
                .andExpect(jsonPath("$.roomId").value(roomId))
                .andExpect(jsonPath("$.roomVersion").isNumber())
                .andExpect(jsonPath("$.selfMembershipId")
                        .value(ownerMembershipId))
                .andExpect(jsonPath("$.positions.length()")
                        .value(2))
                .andExpect(jsonPath("$.positions[0].membershipId")
                        .value(expectedMembershipIds.get(0)))
                .andExpect(jsonPath("$.positions[1].membershipId")
                        .value(expectedMembershipIds.get(1)))
                .andExpect(jsonPath(
                        "$.positions[0].messageVisibleAfterSequence")
                        .value(0))
                .andExpect(jsonPath(
                        "$.positions[0].storedLastReadSequence")
                        .value(0))
                .andExpect(jsonPath("$.generatedAt").isString())
                .andReturn();
        assertThat(snapshot.getResponse().getContentAsString())
                .doesNotContain(
                        "userId",
                        "displayName",
                        "avatar",
                        "effectiveReadThroughSequence");

        commandService.leaveRoom(new LeaveRoomCommand(
                "user-2", requestId(), roomId));
        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}"
                                        + "/read-receipts/state",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("owner-1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.positions.length()")
                        .value(1))
                .andExpect(jsonPath("$.positions[0].membershipId")
                        .value(ownerMembershipId));
        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}"
                                        + "/read-receipts/state",
                                roomId)
                        .with(jwt().jwt(jwt ->
                                jwt.subject("user-2"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    private String createRoom(
            String owner,
            JoinPolicy joinPolicy
    ) {
        return commandService.createRoom(new CreateRoomCommand(
                        owner,
                        requestId(),
                        "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        joinPolicy))
                .result()
                .roomId();
    }

    private long count(String collection) {
        return mongoOperations.getCollection(collection)
                .countDocuments();
    }

    private void assertInvalidUpdateIdempotencyKey(
            String roomId,
            String idempotencyKey
    ) throws Exception {
        MockHttpServletRequestBuilder request = post(
                        "/api/v1/rooms/{roomId}/commands/update-settings",
                        roomId)
                .with(jwt().jwt(jwt ->
                        jwt.subject("owner-1")))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Updated\"}");
        if (idempotencyKey != null) {
            request.header(
                    RoomIdempotencyKeyResolver.HEADER_NAME,
                    idempotencyKey);
        }
        mockMvc.perform(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_IDEMPOTENCY_KEY"));
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
                  "categories":["POLICY"],
                  "visibility":"LISTED",
                  "joinPolicy":"%s"
                }
                """.formatted(joinPolicy);
    }

    private String requestId() {
        return UUID.randomUUID().toString();
    }
}
