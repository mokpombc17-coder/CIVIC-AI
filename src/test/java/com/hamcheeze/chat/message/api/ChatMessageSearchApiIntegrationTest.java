package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
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
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class ChatMessageSearchApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RoomCommandService roomCommandService;

    @Autowired
    private ChatMessageStore messageStore;

    @Test
    void searchesWithReadScopeAndContinuesFromFixedUpperBound()
            throws Exception {
        String roomId = createRoom();
        append(roomId, "needle oldest");
        append(roomId, "other content");
        append(roomId, "needle latest");

        MvcResult first = mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"query":"NEEDLE","limit":1}
                                """))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        containsString("no-store")))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomSequence").value(3))
                .andExpect(jsonPath("$.items[0].senderMembershipId")
                        .value("membership-owner-1"))
                .andExpect(jsonPath("$.items[0].senderUserId")
                        .doesNotExist())
                .andExpect(jsonPath("$.searchComplete").value(false))
                .andExpect(jsonPath("$.nextCursor").isNotEmpty())
                .andReturn();
        JsonNode firstBody = objectMapper.readTree(
                first.getResponse().getContentAsString());
        String cursor = firstBody.get("nextCursor").asText();

        append(roomId, "needle created after search start");

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new ChatMessageSearchRequest(
                                        "needle",
                                        cursor,
                                        1))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomSequence").value(1))
                .andExpect(jsonPath("$.searchComplete").value(true))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void validatesSearchBodyAndRequiresRoomsReadScope()
            throws Exception {
        String roomId = createRoom();

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"query":"x","limit":20}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new ChatMessageSearchRequest(
                                        "x".repeat(513),
                                        null,
                                        20))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.detail")
                        .value("message search raw query is too long"));

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt(ChatScopes.ROOMS_WRITE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"query":"valid query","limit":20}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void rejectsNonMemberAndClosedRoomWithDistinctErrors()
            throws Exception {
        String roomId = createRoom();
        String requestBody = """
                {"query":"valid query","limit":20}
                """;

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt("outsider", ChatScopes.ROOMS_READ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        roomCommandService.closeRoom(new CloseRoomCommand(
                "owner-1",
                UUID.randomUUID().toString(),
                roomId));

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt(ChatScopes.ROOMS_READ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("MESSAGE_SEARCH_NOT_AVAILABLE"));
    }

    @Test
    void bindsSearchToVisibilityBoundaryAndInvalidatesCursorOnRejoin()
            throws Exception {
        String roomId = createRoom();
        append(roomId, "needle before join");
        roomCommandService.joinRoom(new JoinRoomCommand(
                "user-2",
                UUID.randomUUID().toString(),
                roomId));
        append(roomId, "needle after join older");
        append(roomId, "needle after join latest");

        MvcResult first = mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt("user-2", ChatScopes.ROOMS_READ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"query":"needle","limit":1}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomSequence").value(3))
                .andExpect(jsonPath("$.searchComplete").value(false))
                .andReturn();
        String cursor = objectMapper.readTree(
                        first.getResponse().getContentAsString())
                .get("nextCursor")
                .asText();

        roomCommandService.leaveRoom(new LeaveRoomCommand(
                "user-2",
                UUID.randomUUID().toString(),
                roomId));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt("user-2", ChatScopes.ROOMS_READ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"query":"needle","limit":1}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        roomCommandService.joinRoom(new JoinRoomCommand(
                "user-2",
                UUID.randomUUID().toString(),
                roomId));
        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt("user-2", ChatScopes.ROOMS_READ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new ChatMessageSearchRequest(
                                        "needle",
                                        cursor,
                                        1))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURSOR"));
    }

    @Test
    void rejectsBannedMembership() throws Exception {
        String roomId = createRoom();
        String membershipId = roomCommandService.joinRoom(
                        new JoinRoomCommand(
                                "user-3",
                                UUID.randomUUID().toString(),
                                roomId))
                .result()
                .membershipId();
        roomCommandService.banMember(new BanMemberCommand(
                "owner-1",
                UUID.randomUUID().toString(),
                roomId,
                membershipId));

        mockMvc.perform(post(
                                "/api/v1/rooms/{roomId}/messages/search",
                                roomId)
                        .with(jwt("user-3", ChatScopes.ROOMS_READ))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"query":"valid query","limit":20}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    private String createRoom() {
        return roomCommandService.createRoom(new CreateRoomCommand(
                        "owner-1",
                        UUID.randomUUID().toString(),
                        "Search room",
                        List.of(RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN))
                .result()
                .roomId();
    }

    private void append(String roomId, String content) {
        messageStore.append(new NewChatMessage(
                roomId,
                "owner-1",
                "membership-owner-1",
                UUID.randomUUID().toString(),
                content));
    }

    private JwtRequestPostProcessor jwt(String scope) {
        return jwt("owner-1", scope);
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
}
