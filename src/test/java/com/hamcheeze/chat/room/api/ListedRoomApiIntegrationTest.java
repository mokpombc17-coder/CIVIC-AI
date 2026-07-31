package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Room;
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

import java.time.Instant;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
                .andExpect(jsonPath("$.items[0].description")
                        .value("Description room-a"))
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

    private void insert(
            String roomId,
            String name,
            RoomStatus status,
            RoomVisibility visibility,
            JoinPolicy joinPolicy
    ) {
        roomStore.insert(Room.restore(
                roomId,
                name,
                "Description " + roomId,
                "owner-" + roomId,
                status,
                visibility,
                joinPolicy,
                status == RoomStatus.ACTIVE ? 1 : 0,
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

    private String nextCursor(MvcResult result) throws Exception {
        Matcher matcher = NEXT_CURSOR.matcher(
                result.getResponse().getContentAsString());
        if (!matcher.find()) {
            throw new AssertionError("nextCursor is missing");
        }
        return matcher.group(1);
    }
}
