package com.hamcheeze.chat.room.category.api;

import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.room.category.RoomCategorySeedInitializer;
import com.hamcheeze.chat.room.category.mongo.MongoRoomCategoryDocument;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryPort;
import com.hamcheeze.chat.room.event.RoomEventEnvelope;
import com.hamcheeze.chat.room.event.RoomSettingsUpdatedEventPayload;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.data.mongodb.core.query.Query;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RoomCategoryApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RoomCategorySeedInitializer seedInitializer;

    @MockitoSpyBean
    private RoomEventDeliveryPort eventDeliveryPort;

    @BeforeEach
    void resetCategories() {
        mongoOperations.remove(
                new Query(),
                MongoRoomCategoryDocument.COLLECTION_NAME);
        seedInitializer.initialize();
        clearInvocations(eventDeliveryPort);
    }

    @Test
    void userAndAdminListSeededCategoriesWithDedicatedScopes()
            throws Exception {
        mockMvc.perform(get("/api/v1/room-categories")
                        .with(jwt("user-1", ChatScopes.ROOMS_READ)))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].categoryId")
                        .value(RoomCategoryDefaults.POLICY_CATEGORY_ID))
                .andExpect(jsonPath("$.items[0].name").value("정책"));

        mockMvc.perform(get("/api/v1/admin/room-categories")
                        .with(jwt(
                                "admin-1",
                                ChatScopes.CATEGORIES_MANAGE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1));

        mockMvc.perform(get("/api/v1/admin/room-categories")
                        .with(jwt("admin-1", ChatScopes.ROOMS_APPROVE)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        mockMvc.perform(get("/api/v1/room-categories")
                        .with(jwt(
                                "admin-1",
                                ChatScopes.CATEGORIES_MANAGE)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @Test
    void adminCategoryResponsesExposeUsageAndDeleteCapability()
            throws Exception {
        MvcResult created = mockMvc.perform(post(
                        "/api/v1/admin/room-categories")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"교통\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.usageCount").value(0))
                .andExpect(jsonPath("$.deletable").value(true))
                .andReturn();
        String categoryId = json(created)
                .get("categoryId")
                .asText();

        mockMvc.perform(get("/api/v1/admin/room-categories")
                        .with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2));
        mockMvc.perform(get(
                        "/api/v1/admin/room-categories/{categoryId}",
                        RoomCategoryDefaults.POLICY_CATEGORY_ID)
                        .with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usageCount").value(0))
                .andExpect(jsonPath("$.deletable").value(false));
        mockMvc.perform(get(
                        "/api/v1/admin/room-categories/{categoryId}",
                        categoryId)
                        .with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usageCount").value(0))
                .andExpect(jsonPath("$.deletable")
                        .value(true));

        mongoOperations.getCollection(
                        MongoRoomDocument.COLLECTION_NAME)
                .insertOne(new Document("_id", "room-category-usage")
                        .append("categoryIds", List.of(categoryId)));

        mockMvc.perform(get(
                        "/api/v1/admin/room-categories/{categoryId}",
                        categoryId)
                        .with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usageCount").value(1))
                .andExpect(jsonPath("$.deletable").value(false));
    }

    @Test
    void adminCreatesRenamesInspectsAndDeletesUnusedCategory()
            throws Exception {
        MvcResult created = mockMvc.perform(post(
                        "/api/v1/admin/room-categories")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  환경  \"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string(
                        "Cache-Control",
                        org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.name").value("환경"))
                .andExpect(jsonPath("$.version").value(0))
                .andReturn();
        JsonNode createdBody = json(created);
        String categoryId = createdBody.get("categoryId").asText();
        assertThat(created.getResponse().getHeader("Location"))
                .isEqualTo("http://localhost/api/v1/admin/room-categories/"
                        + categoryId);

        mockMvc.perform(get(
                        "/api/v1/admin/room-categories/{categoryId}",
                        categoryId)
                        .with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("환경"));

        mockMvc.perform(patch(
                        "/api/v1/admin/room-categories/{categoryId}",
                        categoryId)
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"기후·환경\","
                                + "\"expectedVersion\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("기후·환경"))
                .andExpect(jsonPath("$.version").value(1));

        mockMvc.perform(delete(
                        "/api/v1/admin/room-categories/{categoryId}",
                        categoryId)
                        .queryParam("expectedVersion", "1")
                        .with(admin()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get(
                        "/api/v1/admin/room-categories/{categoryId}",
                        categoryId)
                        .with(admin()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CATEGORY_NOT_FOUND"));
    }

    @Test
    void adminReceivesStableValidationAndConflictErrors()
            throws Exception {
        mockMvc.perform(post("/api/v1/admin/room-categories")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\" 정책 \"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CATEGORY_NAME_CONFLICT"));

        mockMvc.perform(post("/api/v1/admin/room-categories")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\""
                                + "가".repeat(51)
                                + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_ROOM_CATEGORY"));

        mockMvc.perform(delete(
                        "/api/v1/admin/room-categories/{categoryId}",
                        RoomCategoryDefaults.POLICY_CATEGORY_ID)
                        .queryParam("expectedVersion", "0")
                        .with(admin()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CATEGORY_DEFAULT_PROTECTED"));
    }

    @Test
    void adminCannotDeleteCategoryReferencedByAnyStoredRoom()
            throws Exception {
        MvcResult created = mockMvc.perform(post(
                        "/api/v1/admin/room-categories")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"지역\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String categoryId = json(created)
                .get("categoryId")
                .asText();
        mongoOperations.getCollection(
                        MongoRoomDocument.COLLECTION_NAME)
                .insertOne(new Document("_id", "room-category-reference")
                        .append("categoryIds", List.of(categoryId)));

        mockMvc.perform(delete(
                        "/api/v1/admin/room-categories/{categoryId}",
                        categoryId)
                        .queryParam("expectedVersion", "0")
                        .with(admin()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CATEGORY_IN_USE"))
                .andExpect(jsonPath("$.referencedRoomCount")
                        .value(1));
    }

    @Test
    void staleCategoryVersionDoesNotOverwriteCurrentName()
            throws Exception {
        MvcResult created = mockMvc.perform(post(
                        "/api/v1/admin/room-categories")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"지역\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String categoryId = json(created)
                .get("categoryId")
                .asText();

        mockMvc.perform(patch(
                        "/api/v1/admin/room-categories/{categoryId}",
                        categoryId)
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"지역 현안\","
                                + "\"expectedVersion\":0}"))
                .andExpect(status().isOk());

        mockMvc.perform(patch(
                        "/api/v1/admin/room-categories/{categoryId}",
                        categoryId)
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"지역 정책\","
                                + "\"expectedVersion\":0}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CATEGORY_VERSION_CONFLICT"));
    }

    @Test
    void adminAddsAndRemovesExistingRoomCategoriesWithVersionCheck()
            throws Exception {
        String roomId = "room-category-assignment";
        seedActiveRoom(roomId, "owner-1");
        MvcResult created = mockMvc.perform(post(
                        "/api/v1/admin/room-categories")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"환경\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String categoryId = json(created).get("categoryId").asText();

        mockMvc.perform(put(
                        "/api/v1/admin/rooms/{roomId}/categories",
                        roomId)
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignmentBody(
                                0,
                                RoomCategoryDefaults.POLICY_CATEGORY_ID,
                                categoryId)))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.categoryIds.length()").value(2))
                .andExpect(jsonPath("$.roomVersion").value(1))
                .andExpect(jsonPath("$.changed").value(true));
        org.mockito.ArgumentCaptor<RoomEventEnvelope> event =
                org.mockito.ArgumentCaptor.forClass(
                        RoomEventEnvelope.class);
        verify(eventDeliveryPort).publishToRoom(event.capture());
        assertThat(event.getValue().payload())
                .isInstanceOfSatisfying(
                        RoomSettingsUpdatedEventPayload.class,
                        payload -> assertThat(payload.categoryIds())
                                .containsExactlyInAnyOrder(
                                        RoomCategoryDefaults
                                                .POLICY_CATEGORY_ID,
                                        categoryId));

        mockMvc.perform(put(
                        "/api/v1/admin/rooms/{roomId}/categories",
                        roomId)
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignmentBody(
                                1,
                                categoryId,
                                RoomCategoryDefaults.POLICY_CATEGORY_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomVersion").value(1))
                .andExpect(jsonPath("$.changed").value(false));
        verify(eventDeliveryPort, times(1)).publishToRoom(
                org.mockito.ArgumentMatchers.any());

        mockMvc.perform(put(
                        "/api/v1/admin/rooms/{roomId}/categories",
                        roomId)
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignmentBody(
                                0,
                                RoomCategoryDefaults.POLICY_CATEGORY_ID)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(
                        "ROOM_CATEGORY_ASSIGNMENT_VERSION_CONFLICT"));

        mockMvc.perform(put(
                        "/api/v1/admin/rooms/{roomId}/categories",
                        roomId)
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignmentBody(
                                1,
                                RoomCategoryDefaults.POLICY_CATEGORY_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomVersion").value(2))
                .andExpect(jsonPath("$.changed").value(true));
        verify(eventDeliveryPort, times(2)).publishToRoom(
                org.mockito.ArgumentMatchers.any());

        mockMvc.perform(delete(
                        "/api/v1/admin/room-categories/{categoryId}",
                        categoryId)
                        .queryParam("expectedVersion", "0")
                        .with(admin()))
                .andExpect(status().isNoContent());
    }

    @Test
    void roomCategoryAssignmentRequiresManageScopeAndExistingValues()
            throws Exception {
        String endpoint =
                "/api/v1/admin/rooms/missing-room/categories";
        String body = assignmentBody(
                0,
                RoomCategoryDefaults.POLICY_CATEGORY_ID);

        mockMvc.perform(put(endpoint)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(put(endpoint)
                        .with(jwt("admin-1", ChatScopes.ROOMS_APPROVE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
        mockMvc.perform(put(endpoint)
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ROOM_NOT_FOUND"));

        String roomId = "room-category-invalid-assignment";
        seedActiveRoom(roomId, "owner-1");
        for (String invalidBody : List.of(
                "{\"categoryIds\":[],\"expectedVersion\":0}",
                assignmentBody(
                        0,
                        RoomCategoryDefaults.POLICY_CATEGORY_ID,
                        RoomCategoryDefaults.POLICY_CATEGORY_ID),
                assignmentBody(0, "1", "2", "3", "4", "5", "6"),
                "{\"categoryIds\":[\""
                        + RoomCategoryDefaults.POLICY_CATEGORY_ID
                        + "\"]}")) {
            mockMvc.perform(put(
                            "/api/v1/admin/rooms/{roomId}/categories",
                            roomId)
                            .with(admin())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(invalidBody))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code")
                            .value("INVALID_REQUEST"));
        }
        mockMvc.perform(put(
                        "/api/v1/admin/rooms/{roomId}/categories",
                        roomId)
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignmentBody(0, "missing-category")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code")
                        .value("ROOM_CATEGORY_NOT_FOUND"));
    }

    private JwtRequestPostProcessor admin() {
        return jwt("admin-1", ChatScopes.CATEGORIES_MANAGE);
    }

    private JwtRequestPostProcessor jwt(
            String subject,
            String scope
    ) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(jwt -> jwt.subject(subject))
                .authorities(new SimpleGrantedAuthority(
                        ChatScopes.authority(scope)));
    }

    private JsonNode json(MvcResult result) throws Exception {
        return JSON.readTree(
                result.getResponse().getContentAsByteArray());
    }

    private String assignmentBody(
            long expectedVersion,
            String... categoryIds
    ) {
        return "{\"categoryIds\":[\""
                + String.join("\",\"", categoryIds)
                + "\"],\"expectedVersion\":"
                + expectedVersion
                + "}";
    }
}
