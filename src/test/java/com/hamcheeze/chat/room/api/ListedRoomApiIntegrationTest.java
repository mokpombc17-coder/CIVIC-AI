package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class ListedRoomApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-29T00:00:00Z");
    private static final Pattern NEXT_CURSOR = Pattern.compile(
            "\"nextCursor\":\"([^\"]+)\"");

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void listsOnlyActiveListedRoomsWithCursor()
            throws Exception {
        insert(
                "room-a",
                "Alpha",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "room-b",
                "Beta",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.INVITE_ONLY);
        insert(
                "room-c",
                "Hidden",
                RoomStatus.ACTIVE,
                RoomVisibility.UNLISTED,
                JoinPolicy.OPEN);
        insert(
                "room-d",
                "Closed",
                RoomStatus.CLOSED,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);

        MvcResult first = mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam("limit", "1"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        org.hamcrest.Matchers.containsString(
                                "no-store")))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomId")
                        .value("room-a"))
                .andExpect(jsonPath("$.items[0].name")
                        .value("Alpha"))
                .andExpect(jsonPath("$.items[0].ownerMembershipId")
                        .value("membership-owner-room-a"))
                .andExpect(jsonPath("$.items[0].ownerUserId")
                        .doesNotExist())
                .andExpect(jsonPath("$.items[0].description")
                        .value("Description room-a"))
                .andExpect(jsonPath("$.items[0].categories[0]")
                        .value("POLICY"))
                .andExpect(jsonPath("$.items[0].status")
                        .value("ACTIVE"))
                .andExpect(jsonPath("$.items[0].visibility")
                        .value("LISTED"))
                .andExpect(jsonPath("$.items[0].joinPolicy")
                        .value("OPEN"))
                .andExpect(jsonPath("$.hasNext").value(true))
                .andReturn();

        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam("cursor", nextCursor(first))
                        .queryParam("limit", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomId")
                        .value("room-b"))
                .andExpect(jsonPath("$.items[0].name")
                        .value("Beta"))
                .andExpect(jsonPath("$.items[0].joinPolicy")
                        .value("INVITE_ONLY"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist())
                .andExpect(jsonPath("$.hasNext").value(false));
    }

    @Test
    void listedRoomsRequireReadScopeAndValidateCursor()
            throws Exception {
        mockMvc.perform(get("/api/v1/rooms"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_WRITE)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("ACCESS_DENIED"));

        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam("cursor", "invalid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_CURSOR"));
    }

    @Test
    void filtersByCanonicalNameCategoryAndJoinPolicy()
            throws Exception {
        insert(
                "filter-a",
                "Policy Transit Forum",
                RoomCategory.LOCAL_ISSUE,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "filter-b",
                "Policy Transit Invite",
                RoomCategory.LOCAL_ISSUE,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.INVITE_ONLY);
        insert(
                "filter-c",
                "Policy Environment Forum",
                RoomCategory.ENVIRONMENT,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "filter-d",
                "Transit Only",
                RoomCategory.LOCAL_ISSUE,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);

        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam("query", "  POLICY  ")
                        .queryParam("category", "LOCAL_ISSUE")
                        .queryParam("joinPolicy", "OPEN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomId")
                        .value("filter-a"))
                .andExpect(jsonPath("$.hasNext").value(false));
    }

    @Test
    void supportsEveryOptionalCriteriaCombination()
            throws Exception {
        insert(
                "matrix-a",
                "Matrix Needle Alpha",
                RoomCategory.LOCAL_ISSUE,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "matrix-b",
                "Matrix Needle Invite",
                RoomCategory.LOCAL_ISSUE,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.INVITE_ONLY);
        insert(
                "matrix-c",
                "Matrix Needle Environment",
                RoomCategory.ENVIRONMENT,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "matrix-d",
                "Different Title",
                RoomCategory.LOCAL_ISSUE,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);

        assertRooms(
                List.of("matrix-a", "matrix-b", "matrix-c"),
                "query", "matrix needle");
        assertRooms(
                List.of("matrix-a", "matrix-b", "matrix-d"),
                "category", "LOCAL_ISSUE");
        assertRooms(
                List.of("matrix-a", "matrix-c", "matrix-d"),
                "joinPolicy", "OPEN");
        assertRooms(
                List.of("matrix-a", "matrix-b"),
                "query", "matrix needle",
                "category", "LOCAL_ISSUE");
        assertRooms(
                List.of("matrix-a", "matrix-c"),
                "query", "matrix needle",
                "joinPolicy", "OPEN");
        assertRooms(
                List.of("matrix-a", "matrix-d"),
                "category", "LOCAL_ISSUE",
                "joinPolicy", "OPEN");
        assertRooms(
                List.of("matrix-a"),
                "query", "matrix needle",
                "category", "LOCAL_ISSUE",
                "joinPolicy", "OPEN");
    }

    @Test
    void searchesNameAtEveryPositionAndSupportsOneCharacter()
            throws Exception {
        insert(
                "search-a",
                "정책",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "search-b",
                "정책 토론",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "search-c",
                "지역 정책 토론",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "search-d",
                "지역 정책",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "search-e",
                "Policy Discussion",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);

        List<String> koreanMatches = List.of(
                "search-a",
                "search-b",
                "search-c",
                "search-d");
        assertRooms(koreanMatches, "query", "정책");
        assertRooms(koreanMatches, "query", "책");
        assertRooms(List.of("search-e"), "query", "policy");
        assertRooms(List.of(), "query", "검색결과없음");
    }

    @Test
    void paginatesFilteredResultsWithoutDuplicatesOrGaps()
            throws Exception {
        for (int index = 0; index < 45; index++) {
            insert(
                    "page-room-%02d".formatted(index),
                    "Pagination Needle " + index,
                    RoomCategory.LOCAL_ISSUE,
                    RoomStatus.ACTIVE,
                    RoomVisibility.LISTED,
                    JoinPolicy.OPEN);
        }
        insert(
                "page-excluded-category",
                "Pagination Needle Category",
                RoomCategory.POLICY,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "page-excluded-policy",
                "Pagination Needle Invite",
                RoomCategory.LOCAL_ISSUE,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.INVITE_ONLY);

        MvcResult first = performFilteredPage(null)
                .andExpect(jsonPath("$.items.length()").value(20))
                .andExpect(jsonPath("$.hasNext").value(true))
                .andReturn();
        assertThat(roomIds(first))
                .containsExactlyElementsOf(pageRoomIds(0, 20));

        MvcResult second = performFilteredPage(nextCursor(first))
                .andExpect(jsonPath("$.items.length()").value(20))
                .andExpect(jsonPath("$.hasNext").value(true))
                .andReturn();
        assertThat(roomIds(second))
                .containsExactlyElementsOf(pageRoomIds(20, 40));

        MvcResult third = performFilteredPage(nextCursor(second))
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.nextCursor").doesNotExist())
                .andExpect(jsonPath("$.hasNext").value(false))
                .andReturn();
        assertThat(roomIds(third))
                .containsExactlyElementsOf(pageRoomIds(40, 45));
    }

    @Test
    void treatsRegexMetacharactersAsLiteralText()
            throws Exception {
        insert(
                "literal-a",
                ".* Discussion",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "literal-b",
                "General Discussion",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);

        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam("query", ".*"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomId")
                        .value("literal-a"));
    }

    @Test
    void rejectsInvalidRepeatedAndCursorMismatchedCriteria()
            throws Exception {
        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam("category", "UNKNOWN"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"));
        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam("joinPolicy", "open"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"));
        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam("query", "one", "two"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"));

        insert(
                "cursor-a",
                "Policy One",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        insert(
                "cursor-b",
                "Policy Two",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN);
        MvcResult first = mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam("query", "policy")
                        .queryParam("limit", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasNext").value(true))
                .andReturn();

        mockMvc.perform(get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam("query", "environment")
                        .queryParam("cursor", nextCursor(first))
                        .queryParam("limit", "1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_CURSOR"));
    }

    private void insert(
            String roomId,
            String name,
            RoomStatus status,
            RoomVisibility visibility,
            JoinPolicy joinPolicy
    ) {
        insert(
                roomId,
                name,
                RoomCategory.POLICY,
                status,
                visibility,
                joinPolicy);
    }

    private void insert(
            String roomId,
            String name,
            RoomCategory category,
            RoomStatus status,
            RoomVisibility visibility,
            JoinPolicy joinPolicy
    ) {
        roomStore.insert(Room.restore(
                roomId,
                name,
                "Description " + roomId,
                java.util.List.of(category),
                "membership-owner-" + roomId,
                "owner-" + roomId,
                status,
                visibility,
                joinPolicy,
                status == RoomStatus.ACTIVE ? 1 : 0,
                Math.max(2L, (long) (status == RoomStatus.ACTIVE ? 1 : 0) + 1L),
                CREATED_AT,
                status == RoomStatus.CLOSED
                        ? CREATED_AT.plusSeconds(60)
                        : null,
                0));
    }

    private JwtRequestPostProcessor jwt(String scope) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(jwt -> jwt.subject("user-1"))
                .authorities(new SimpleGrantedAuthority(
                        ChatScopes.authority(scope)));
    }

    private void assertRooms(
            List<String> expectedRoomIds,
            String... parameters
    ) throws Exception {
        MockHttpServletRequestBuilder request =
                get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ));
        for (int index = 0;
                index < parameters.length;
                index += 2) {
            request.queryParam(
                    parameters[index],
                    parameters[index + 1]);
        }
        MvcResult result = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasNext").value(false))
                .andReturn();
        assertThat(roomIds(result))
                .containsExactlyElementsOf(expectedRoomIds);
    }

    private ResultActions performFilteredPage(String cursor)
            throws Exception {
        MockHttpServletRequestBuilder request =
                get("/api/v1/rooms")
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .queryParam(
                                "query",
                                "  PAGINATION NEEDLE  ")
                        .queryParam("category", "LOCAL_ISSUE")
                        .queryParam("joinPolicy", "OPEN")
                        .queryParam("limit", "20");
        if (cursor != null) {
            request.queryParam("cursor", cursor);
        }
        return mockMvc.perform(request)
                .andExpect(status().isOk());
    }

    private List<String> roomIds(MvcResult result)
            throws Exception {
        JsonNode items = objectMapper.readTree(
                result.getResponse().getContentAsByteArray())
                .path("items");
        List<String> roomIds = new ArrayList<>();
        for (JsonNode item : items) {
            roomIds.add(item.path("roomId").asText());
        }
        return roomIds;
    }

    private List<String> pageRoomIds(
            int startInclusive,
            int endExclusive
    ) {
        return IntStream.range(startInclusive, endExclusive)
                .mapToObj(index ->
                        "page-room-%02d".formatted(index))
                .toList();
    }

    private String nextCursor(MvcResult result) throws Exception {
        Matcher matcher = NEXT_CURSOR.matcher(
                result.getResponse().getContentAsString());
        if (!matcher.find()) {
            throw new AssertionError("nextCursor is missing");
        }
        return matcher.group(1);
    }
}
