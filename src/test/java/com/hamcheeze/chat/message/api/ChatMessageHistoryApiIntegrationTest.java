package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
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

import java.util.UUID;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class ChatMessageHistoryApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RoomCommandService roomCommandService;

    @Autowired
    private ChatMessageStore messageStore;

    @Test
    void activeMemberReadsMessagesAfterSequenceInPages()
            throws Exception {
        String roomId = createRoom("owner-1");
        append(roomId, "owner-1", "first");
        append(roomId, "owner-1", "second");
        append(roomId, "owner-1", "third");

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                roomId)
                        .with(jwt("owner-1", ChatScopes.ROOMS_READ))
                        .queryParam("afterSequence", "1")
                        .queryParam("limit", "1"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        org.hamcrest.Matchers.containsString(
                                "no-store")))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomId")
                        .value(roomId))
                .andExpect(jsonPath("$.items[0].roomSequence")
                        .value(2))
                .andExpect(jsonPath("$.items[0].senderUserId")
                        .value("owner-1"))
                .andExpect(jsonPath("$.items[0].content")
                        .value("second"))
                .andExpect(jsonPath("$.nextAfterSequence")
                        .value(2))
                .andExpect(jsonPath("$.hasNext").value(true));

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                roomId)
                        .with(jwt("owner-1", ChatScopes.ROOMS_READ))
                        .queryParam("afterSequence", "2")
                        .queryParam("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].roomSequence")
                        .value(3))
                .andExpect(jsonPath("$.items[0].content")
                        .value("third"))
                .andExpect(jsonPath("$.nextAfterSequence")
                        .value(nullValue()))
                .andExpect(jsonPath("$.hasNext").value(false));
    }

    @Test
    void historyRequiresReadScopeAndActiveMembership()
            throws Exception {
        String roomId = createRoom("owner-1");

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                roomId)
                        .with(jwt(
                                "owner-1",
                                ChatScopes.MESSAGES_WRITE)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("ACCESS_DENIED"));

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                roomId)
                        .with(jwt("user-2", ChatScopes.ROOMS_READ)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code")
                        .value("ACCESS_DENIED"));
    }

    @Test
    void historyValidatesRoomSequenceAndLimit()
            throws Exception {
        for (String query : new String[]{
                "afterSequence=-1",
                "limit=0",
                "limit=101"}) {
            String[] pair = query.split("=");
            mockMvc.perform(get(
                                    "/api/v1/rooms/{roomId}/messages",
                                    "room-1")
                            .with(jwt(
                                    "owner-1",
                                    ChatScopes.ROOMS_READ))
                            .queryParam(pair[0], pair[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code")
                            .value("INVALID_REQUEST"));
        }

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                "invalid room!")
                        .with(jwt("owner-1", ChatScopes.ROOMS_READ)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_ROOM_ID"));
    }

    private String createRoom(String ownerUserId) {
        return roomCommandService.createRoom(
                        new CreateRoomCommand(
                                ownerUserId,
                                UUID.randomUUID().toString(),
                                "History room",
                                RoomVisibility.LISTED,
                                JoinPolicy.OPEN))
                .result()
                .roomId();
    }

    private void append(
            String roomId,
            String senderUserId,
            String content
    ) {
        messageStore.append(new NewChatMessage(
                roomId,
                senderUserId,
                UUID.randomUUID().toString(),
                content));
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
