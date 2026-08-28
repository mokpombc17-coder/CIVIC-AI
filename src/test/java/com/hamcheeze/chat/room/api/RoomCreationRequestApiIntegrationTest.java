package com.hamcheeze.chat.room.api;

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
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

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
class RoomCreationRequestApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;

    @Test
    void approvalRequiredPersistsPendingAndSupportsOwnStatusAndCancel()
            throws Exception {
        String key = requestId();
        MvcResult submitted = submit("requester-1", key, "Room one")
                .andExpect(status().isAccepted())
                .andExpect(header().string(
                        "Location",
                        org.hamcrest.Matchers.startsWith(
                                "/api/v1/me/room-creation-requests/")))
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CREATION_REQUESTED"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.replayed").value(false))
                .andExpect(jsonPath("$.roomId").isEmpty())
                .andExpect(jsonPath("$.ownerMembershipId").isEmpty())
                .andReturn();
        String creationRequestId = json(submitted)
                .get("creationRequestId").asText();

        assertThat(count(MongoRoomDocument.COLLECTION_NAME)).isZero();
        assertThat(count(MongoMembershipDocument.COLLECTION_NAME))
                .isZero();
        MongoRoomCreationRequestDocument stored =
                mongoOperations.findById(
                        creationRequestId,
                        MongoRoomCreationRequestDocument.class,
                        MongoRoomCreationRequestDocument.COLLECTION_NAME);
        assertThat(stored).isNotNull();
        assertThat(stored.status())
                .isEqualTo(RoomCreationRequestStatus.PENDING);
        assertThat(stored.name()).isEqualTo("Room one");
        assertThat(stored.approvedRoomId()).isNull();

        submit("requester-1", key, "Room one")
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.creationRequestId")
                        .value(creationRequestId))
                .andExpect(jsonPath("$.replayed").value(true));

        mockMvc.perform(get(
                        "/api/v1/me/room-creation-requests/{id}",
                        creationRequestId)
                        .with(jwt("requester-1", ChatScopes.ROOMS_READ)))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.creationRequestId")
                        .value(creationRequestId))
                .andExpect(jsonPath("$.name").value("Room one"))
                .andExpect(jsonPath("$.replayed").value(false));

        mockMvc.perform(get(
                        "/api/v1/me/room-creation-requests/{id}",
                        creationRequestId)
                        .with(jwt("requester-2", ChatScopes.ROOMS_READ)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CREATION_REQUEST_NOT_FOUND"));

        mockMvc.perform(post(
                        "/api/v1/me/room-creation-requests/{id}/cancel",
                        creationRequestId)
                        .with(jwt("requester-1", ChatScopes.ROOMS_WRITE)))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Location",
                        "/api/v1/me/room-creation-requests/"
                                + creationRequestId))
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CREATION_CANCELED"))
                .andExpect(jsonPath("$.status").value("CANCELED"))
                .andExpect(jsonPath("$.replayed").value(false));

        mockMvc.perform(post(
                        "/api/v1/me/room-creation-requests/{id}/cancel",
                        creationRequestId)
                        .with(jwt("requester-1", ChatScopes.ROOMS_WRITE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.replayed").value(true));
    }

    @Test
    void idempotencyConflictAndPendingLimitAreEnforced()
            throws Exception {
        String firstKey = requestId();
        submit("requester-limit", firstKey, "Room one")
                .andExpect(status().isAccepted());
        submit("requester-limit", firstKey, "Different room")
                .andExpect(status().isConflict())
                .andExpect(content().contentType(
                        MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code")
                        .value("IDEMPOTENCY_CONFLICT"));

        submit("requester-limit", requestId(), "Room two")
                .andExpect(status().isAccepted());
        submit("requester-limit", requestId(), "Room three")
                .andExpect(status().isAccepted());
        submit("requester-limit", requestId(), "Room four")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CREATION_PENDING_LIMIT_EXCEEDED"));

        assertThat(count(
                MongoRoomCreationRequestDocument.COLLECTION_NAME))
                .isEqualTo(3);
    }

    @Test
    void ownListUsesOldestFirstCursorAndScopesAreIsolated()
            throws Exception {
        String firstId = json(submit(
                "requester-list",
                requestId(),
                "First room")
                .andExpect(status().isAccepted())
                .andReturn()).get("creationRequestId").asText();
        String secondId = json(submit(
                "requester-list",
                requestId(),
                "Second room")
                .andExpect(status().isAccepted())
                .andReturn()).get("creationRequestId").asText();
        submit("someone-else", requestId(), "Hidden room")
                .andExpect(status().isAccepted());

        MvcResult firstPage = mockMvc.perform(get(
                        "/api/v1/me/room-creation-requests")
                        .queryParam("limit", "1")
                        .with(jwt(
                                "requester-list",
                                ChatScopes.ROOMS_READ)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].creationRequestId")
                        .value(firstId))
                .andExpect(jsonPath("$.items[0].name")
                        .value("First room"))
                .andExpect(jsonPath("$.hasNext").value(true))
                .andExpect(jsonPath("$.nextCursor").isString())
                .andReturn();
        String cursor = json(firstPage).get("nextCursor").asText();

        mockMvc.perform(get("/api/v1/me/room-creation-requests")
                        .queryParam("limit", "1")
                        .queryParam("cursor", cursor)
                        .with(jwt(
                                "requester-list",
                                ChatScopes.ROOMS_READ)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].creationRequestId")
                        .value(secondId))
                .andExpect(jsonPath("$.items[0].name")
                        .value("Second room"))
                .andExpect(jsonPath("$.hasNext").value(false));

        mockMvc.perform(get("/api/v1/me/room-creation-requests")
                        .with(jwt(
                                "requester-list",
                                ChatScopes.ROOMS_WRITE)))
                .andExpect(status().isForbidden());
        mockMvc.perform(post(
                        "/api/v1/me/room-creation-requests/{id}/cancel",
                        firstId)
                        .with(jwt(
                                "requester-list",
                                ChatScopes.ROOMS_READ)))
                .andExpect(status().isForbidden());
    }

    @Test
    void activeRoomQuotaIsCheckedBeforeRequestIsPersisted()
            throws Exception {
        seedActiveRoom("quota-room-1", "quota-user");
        seedActiveRoom("quota-room-2", "quota-user");

        submit("quota-user", requestId(), "Over quota")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("USER_ACTIVE_ROOM_LIMIT_EXCEEDED"));

        assertThat(count(
                MongoRoomCreationRequestDocument.COLLECTION_NAME))
                .isZero();
    }

    private org.springframework.test.web.servlet.ResultActions submit(
            String userId,
            String idempotencyKey,
            String name
    ) throws Exception {
        return mockMvc.perform(post("/api/v1/rooms")
                .with(jwt(userId, ChatScopes.ROOMS_WRITE))
                .header("Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "name":"%s",
                          "categories":["POLICY"],
                          "visibility":"LISTED",
                          "joinPolicy":"OPEN"
                        }
                        """.formatted(name)));
    }

    private static JwtRequestPostProcessor jwt(
            String subject,
            String... scopes
    ) {
        SimpleGrantedAuthority[] authorities =
                java.util.Arrays.stream(scopes)
                        .map(ChatScopes::authority)
                        .map(SimpleGrantedAuthority::new)
                        .toArray(SimpleGrantedAuthority[]::new);
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(jwt -> jwt.subject(subject))
                .authorities(authorities);
    }

    private static JsonNode json(MvcResult result) throws Exception {
        return JSON.readTree(
                result.getResponse().getContentAsString());
    }

    private static String requestId() {
        return UUID.randomUUID().toString();
    }

    private long count(String collectionName) {
        return mongoOperations.count(new Query(), collectionName);
    }
}
