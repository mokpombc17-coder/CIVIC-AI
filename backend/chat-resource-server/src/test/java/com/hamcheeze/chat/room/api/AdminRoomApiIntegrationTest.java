package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.category.RoomCategory;
import com.hamcheeze.chat.room.category.RoomCategoryDefaults;
import com.hamcheeze.chat.room.category.persistence.RoomCategoryStore;
import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class AdminRoomApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-28T00:00:00Z");
    private static final String CUSTOM_CATEGORY_ID =
            "admin-room-custom-category";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private RoomCategoryStore categoryStore;

    @Test
    void listsAllRoomsAcrossStatusAndVisibilityWithCursor()
            throws Exception {
        insert(
                "admin-room-a",
                "Active listed",
                List.of(RoomCategoryDefaults.POLICY_CATEGORY_ID),
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED);
        insert(
                "admin-room-b",
                "Active hidden",
                List.of(CUSTOM_CATEGORY_ID),
                RoomStatus.ACTIVE,
                RoomVisibility.UNLISTED);
        insert(
                "admin-room-c",
                "Closed listed",
                List.of(CUSTOM_CATEGORY_ID),
                RoomStatus.CLOSED,
                RoomVisibility.LISTED);

        MvcResult first = mockMvc.perform(get("/api/v1/admin/rooms")
                        .with(admin())
                        .queryParam("limit", "2"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].roomId")
                        .value("admin-room-a"))
                .andExpect(jsonPath("$.items[1].roomId")
                        .value("admin-room-b"))
                .andExpect(jsonPath("$.items[1].status")
                        .value("ACTIVE"))
                .andExpect(jsonPath("$.items[1].visibility")
                        .value("UNLISTED"))
                .andExpect(jsonPath(
                        "$.items[1].categorySummaries[0].categoryId")
                        .value(CUSTOM_CATEGORY_ID))
                .andExpect(jsonPath(
                        "$.items[1].categorySummaries[0].name")
                        .value("관리 카테고리"))
                .andExpect(jsonPath("$.items[1].version").value(0))
                .andExpect(jsonPath("$.hasNext").value(true))
                .andReturn();

        mockMvc.perform(get("/api/v1/admin/rooms")
                        .with(admin())
                        .queryParam("cursor", nextCursor(first))
                        .queryParam("limit", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomId")
                        .value("admin-room-c"))
                .andExpect(jsonPath("$.items[0].status")
                        .value("CLOSED"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist())
                .andExpect(jsonPath("$.hasNext").value(false));
    }

    @Test
    void filtersByNameCategoryStatusAndVisibility()
            throws Exception {
        insert(
                "admin-filter-a",
                "Hidden policy discussion",
                List.of(CUSTOM_CATEGORY_ID),
                RoomStatus.ACTIVE,
                RoomVisibility.UNLISTED);
        insert(
                "admin-filter-b",
                "Hidden policy archive",
                List.of(CUSTOM_CATEGORY_ID),
                RoomStatus.CLOSED,
                RoomVisibility.UNLISTED);
        insert(
                "admin-filter-c",
                "Visible policy discussion",
                List.of(CUSTOM_CATEGORY_ID),
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED);

        mockMvc.perform(get("/api/v1/admin/rooms")
                        .with(admin())
                        .queryParam("query", "  DISCUSSION  ")
                        .queryParam("categoryId", CUSTOM_CATEGORY_ID)
                        .queryParam("status", "ACTIVE")
                        .queryParam("visibility", "UNLISTED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomId")
                        .value("admin-filter-a"));
    }

    @Test
    void requiresManageScopeAndValidatesCriteriaBoundCursor()
            throws Exception {
        insert(
                "admin-cursor-a",
                "Cursor A",
                List.of(CUSTOM_CATEGORY_ID),
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED);
        insert(
                "admin-cursor-b",
                "Cursor B",
                List.of(CUSTOM_CATEGORY_ID),
                RoomStatus.CLOSED,
                RoomVisibility.UNLISTED);

        mockMvc.perform(get("/api/v1/admin/rooms"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/admin/rooms")
                        .with(jwt(ChatScopes.ROOMS_APPROVE)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        MvcResult first = mockMvc.perform(get("/api/v1/admin/rooms")
                        .with(admin())
                        .queryParam("categoryId", CUSTOM_CATEGORY_ID)
                        .queryParam("limit", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasNext").value(true))
                .andReturn();

        mockMvc.perform(get("/api/v1/admin/rooms")
                        .with(admin())
                        .queryParam("categoryId", CUSTOM_CATEGORY_ID)
                        .queryParam("status", "CLOSED")
                        .queryParam("cursor", nextCursor(first)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
        mockMvc.perform(get("/api/v1/admin/rooms")
                        .with(admin())
                        .queryParam("status", "active"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    private void insert(
            String roomId,
            String name,
            List<String> categoryIds,
            RoomStatus status,
            RoomVisibility visibility
    ) {
        ensureCategories(categoryIds);
        roomStore.insert(Room.restoreWithCategoryIds(
                roomId,
                name,
                "Description " + roomId,
                categoryIds,
                "membership-owner-" + roomId,
                "owner-" + roomId,
                status,
                visibility,
                JoinPolicy.OPEN,
                status == RoomStatus.ACTIVE ? 1 : 0,
                2,
                CREATED_AT,
                status == RoomStatus.CLOSED
                        ? CREATED_AT.plusSeconds(60)
                        : null,
                0));
    }

    private void ensureCategories(List<String> categoryIds) {
        for (String categoryId : categoryIds) {
            if (categoryStore.findById(categoryId).isEmpty()) {
                categoryStore.insert(RoomCategory.create(
                        categoryId,
                        CUSTOM_CATEGORY_ID.equals(categoryId)
                                ? "관리 카테고리"
                                : "정책",
                        CREATED_AT));
            }
        }
    }

    private String nextCursor(MvcResult result) throws Exception {
        return objectMapper.readTree(
                        result.getResponse().getContentAsString())
                .get("nextCursor")
                .asText();
    }

    private JwtRequestPostProcessor admin() {
        return jwt(ChatScopes.CATEGORIES_MANAGE);
    }

    private JwtRequestPostProcessor jwt(String scope) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(jwt -> jwt.subject("admin-1"))
                .authorities(new SimpleGrantedAuthority(
                        ChatScopes.authority(scope)));
    }
}
