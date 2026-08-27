package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.creation.RoomCreationDecisionActorType;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import com.hamcheeze.chat.room.creation.mongo.MongoRoomCreationRequestDocument;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.security.ChatScopes;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.Arrays;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "chat.room.creation.mode=APPROVAL_REQUIRED",
        "chat.room.membership.max-active-rooms-per-user=2"
})
@AutoConfigureMockMvc
@ActiveProfiles("local")
class AdminRoomCreationRequestApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;

    @Test
    void adminListsInspectsAndApprovesWithoutChangingProposal()
            throws Exception {
        String requestId = submit(
                "applicant-1",
                "  정책 토론  ",
                " 검토할 설명 ");

        MvcResult list = mockMvc.perform(get(
                        "/api/v1/admin/room-creation-requests")
                        .queryParam("limit", "1")
                        .with(admin("admin-1")))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].creationRequestId")
                        .value(requestId))
                .andExpect(jsonPath("$.items[0].requesterUserId")
                        .value("applicant-1"))
                .andExpect(jsonPath("$.items[0].name")
                        .value("정책 토론"))
                .andExpect(jsonPath("$.items[0].description")
                        .value("검토할 설명"))
                .andExpect(jsonPath("$.items[0].categories[0]")
                        .value("POLICY"))
                .andExpect(jsonPath("$.items[0].visibility")
                        .value("LISTED"))
                .andExpect(jsonPath("$.items[0].joinPolicy")
                        .value("OPEN"))
                .andExpect(jsonPath("$.items[0].status")
                        .value("PENDING"))
                .andReturn();
        assertThat(json(list).get("items").get(0)
                .has("clientRequestId")).isFalse();

        mockMvc.perform(get(
                        "/api/v1/admin/room-creation-requests/{id}",
                        requestId)
                        .with(admin("admin-1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.creationRequestId")
                        .value(requestId))
                .andExpect(jsonPath("$.replayed").value(false));

        MvcResult approved = mockMvc.perform(post(
                        "/api/v1/admin/room-creation-requests/{id}/approve",
                        requestId)
                        .with(admin("admin-1")))
                .andExpect(status().isCreated())
                .andExpect(header().string(
                        "Location",
                        org.hamcrest.Matchers.startsWith(
                                "/api/v1/rooms/")))
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.roomId").isString())
                .andExpect(jsonPath("$.ownerMembershipId").isString())
                .andExpect(jsonPath("$.replayed").value(false))
                .andReturn();
        String roomId = json(approved).get("roomId").asText();

        MongoRoomCreationRequestDocument stored = request(requestId);
        assertThat(stored.status())
                .isEqualTo(RoomCreationRequestStatus.APPROVED);
        assertThat(stored.decisionActorType())
                .isEqualTo(RoomCreationDecisionActorType.ADMIN);
        assertThat(stored.decidedByAdminId()).isEqualTo("admin-1");
        assertThat(stored.approvedRoomId()).isEqualTo(roomId);
        assertThat(mongoOperations.count(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoRoomDocument.COLLECTION_NAME)).isEqualTo(1);
        assertThat(mongoOperations.count(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoMembershipDocument.COLLECTION_NAME)).isEqualTo(1);

        mockMvc.perform(post(
                        "/api/v1/admin/room-creation-requests/{id}/approve",
                        requestId)
                        .with(admin("admin-2")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomId").value(roomId))
                .andExpect(jsonPath("$.replayed").value(true));
        assertThat(mongoOperations.count(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoRoomDocument.COLLECTION_NAME)).isEqualTo(1);

        mockMvc.perform(get(
                        "/api/v1/admin/room-creation-requests")
                        .queryParam("status", "APPROVED")
                        .with(admin("admin-1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].creationRequestId")
                        .value(requestId));
    }

    @Test
    void rejectionReplaysOnlyForSameReasonAndBlocksOppositeDecision()
            throws Exception {
        String requestId = submit(
                "applicant-reject",
                "반려 대상",
                "설명");

        mockMvc.perform(post(
                        "/api/v1/admin/room-creation-requests/{id}/reject",
                        requestId)
                        .with(admin("admin-1"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"  목적이 불명확합니다.  \"}"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Location",
                        "/api/v1/admin/room-creation-requests/"
                                + requestId))
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectionReason")
                        .value("목적이 불명확합니다."))
                .andExpect(jsonPath("$.replayed").value(false));

        mockMvc.perform(post(
                        "/api/v1/admin/room-creation-requests/{id}/reject",
                        requestId)
                        .with(admin("admin-2"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"목적이 불명확합니다.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true));

        mockMvc.perform(post(
                        "/api/v1/admin/room-creation-requests/{id}/reject",
                        requestId)
                        .with(admin("admin-1"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"다른 사유\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CREATION_DECISION_CONFLICT"));

        mockMvc.perform(post(
                        "/api/v1/admin/room-creation-requests/{id}/approve",
                        requestId)
                        .with(admin("admin-1")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CREATION_DECISION_CONFLICT"));

        assertThat(mongoOperations.count(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoRoomDocument.COLLECTION_NAME)).isZero();
    }

    @Test
    void approvalQuotaFailureLeavesRequestPending()
            throws Exception {
        String requestId = submit(
                "quota-applicant",
                "Quota target",
                "설명");
        seedActiveRoom("existing-room-1", "quota-applicant");
        seedActiveRoom("existing-room-2", "quota-applicant");

        mockMvc.perform(post(
                        "/api/v1/admin/room-creation-requests/{id}/approve",
                        requestId)
                        .with(admin("admin-1")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("USER_ACTIVE_ROOM_LIMIT_EXCEEDED"));

        MongoRoomCreationRequestDocument stored = request(requestId);
        assertThat(stored.status())
                .isEqualTo(RoomCreationRequestStatus.PENDING);
        assertThat(stored.approvedRoomId()).isNull();
        assertThat(stored.resolvedAt()).isNull();
    }

    @Test
    void adminEndpointsRequireDedicatedScopeAndValidSubject()
            throws Exception {
        String endpoint = "/api/v1/admin/room-creation-requests";

        mockMvc.perform(get(endpoint))
                .andExpect(status().isUnauthorized());
        for (String scope : new String[]{
                ChatScopes.ROOMS_READ,
                ChatScopes.ROOMS_WRITE,
                ChatScopes.CHAT_AUDIT_EXPORTS
        }) {
            mockMvc.perform(get(endpoint)
                            .with(jwt("admin-1", scope)))
                    .andExpect(status().isForbidden());
        }
        mockMvc.perform(get(endpoint)
                        .with(admin("admin-1")))
                .andExpect(status().isOk());
        mockMvc.perform(get(endpoint)
                        .with(admin(" ")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code")
                        .value("UNAUTHENTICATED"));
    }

    @Test
    void rejectionReasonValidationAndMissingRequestUseStableErrors()
            throws Exception {
        mockMvc.perform(post(
                        "/api/v1/admin/room-creation-requests/missing/reject")
                        .with(admin("admin-1"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"first\\nsecond\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(post(
                        "/api/v1/admin/room-creation-requests/missing/approve")
                        .with(admin("admin-1")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(
                        "ROOM_CREATION_REQUEST_NOT_FOUND"));
    }

    @Test
    void adminListCursorIsOpaqueStatusBoundAndPaginatesWithoutDuplicates()
            throws Exception {
        String requestId1 = submit(
                "cursor-applicant-1",
                "커서 방 1",
                "첫 번째 신청");
        String requestId2 = submit(
                "cursor-applicant-2",
                "커서 방 2",
                "두 번째 신청");

        MvcResult firstPageResult = mockMvc.perform(get(
                        "/api/v1/admin/room-creation-requests")
                        .queryParam("status", "PENDING")
                        .queryParam("limit", "1")
                        .with(admin("admin-1")))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.hasNext").value(true))
                .andExpect(jsonPath("$.nextCursor").isNotEmpty())
                .andReturn();
        JsonNode firstPage = json(firstPageResult);
        String cursor = firstPage.get("nextCursor").asText();
        String firstPageId = firstPage.get("items").get(0)
                .get("creationRequestId").asText();

        MvcResult secondPageResult = mockMvc.perform(get(
                        "/api/v1/admin/room-creation-requests")
                        .queryParam("status", "PENDING")
                        .queryParam("limit", "1")
                        .queryParam("cursor", cursor)
                        .with(admin("admin-1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.hasNext").value(false))
                .andReturn();
        JsonNode secondPage = json(secondPageResult);
        String secondPageId = secondPage.get("items").get(0)
                .get("creationRequestId").asText();

        assertThat(Arrays.asList(firstPageId, secondPageId))
                .containsExactlyInAnyOrder(requestId1, requestId2);
        assertThat(secondPage.get("nextCursor").isNull()).isTrue();

        mockMvc.perform(get(
                        "/api/v1/admin/room-creation-requests")
                        .queryParam("status", "APPROVED")
                        .queryParam("limit", "1")
                        .queryParam("cursor", cursor)
                        .with(admin("admin-1")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
    }

    @Test
    void adminListRejectsInvalidLimitAndStatusAndDetailIsNotCached()
            throws Exception {
        for (String limit : new String[]{"0", "101"}) {
            mockMvc.perform(get(
                            "/api/v1/admin/room-creation-requests")
                            .queryParam("limit", limit)
                            .with(admin("admin-1")))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }

        mockMvc.perform(get(
                        "/api/v1/admin/room-creation-requests")
                        .queryParam("status", "UNKNOWN")
                        .with(admin("admin-1")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        String requestId = submit(
                "cache-applicant",
                "캐시 확인 방",
                "상세 캐시 금지");
        mockMvc.perform(get(
                        "/api/v1/admin/room-creation-requests/{id}",
                        requestId)
                        .with(admin("admin-1")))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    private String submit(
            String requesterUserId,
            String name,
            String description
    ) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/rooms")
                        .with(jwt(
                                requesterUserId,
                                ChatScopes.ROOMS_WRITE))
                        .header(
                                RoomIdempotencyKeyResolver.HEADER_NAME,
                                UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"%s",
                                  "description":"%s",
                                  "categories":["POLICY"],
                                  "visibility":"LISTED",
                                  "joinPolicy":"OPEN"
                                }
                                """.formatted(name, description)))
                .andExpect(status().isAccepted())
                .andReturn();
        return json(result).get("creationRequestId").asText();
    }

    private MongoRoomCreationRequestDocument request(String requestId) {
        return mongoOperations.findById(
                requestId,
                MongoRoomCreationRequestDocument.class,
                MongoRoomCreationRequestDocument.COLLECTION_NAME);
    }

    private static JwtRequestPostProcessor admin(String subject) {
        return jwt(subject, ChatScopes.ROOMS_APPROVE);
    }

    private static JwtRequestPostProcessor jwt(
            String subject,
            String... scopes
    ) {
        SimpleGrantedAuthority[] authorities = Arrays.stream(scopes)
                .map(ChatScopes::authority)
                .map(SimpleGrantedAuthority::new)
                .toArray(SimpleGrantedAuthority[]::new);
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(token -> token.subject(subject))
                .authorities(authorities);
    }

    private static JsonNode json(MvcResult result) throws Exception {
        return JSON.readTree(
                result.getResponse().getContentAsString());
    }
}
