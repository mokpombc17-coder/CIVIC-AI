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

import static org.hamcrest.Matchers.containsString;
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
    void initialEntryReturnsLatestMessagesAndPaginatesBackward()
            throws Exception {
        String roomId = createRoom("owner-1");
        appendMessages(roomId, "owner-1", 120);

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                roomId)
                        .with(jwt("owner-1", ChatScopes.ROOMS_READ)))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        containsString("no-store")))
                .andExpect(jsonPath("$.items.length()").value(50))
                .andExpect(jsonPath("$.items[0].roomSequence")
                        .value(71))
                .andExpect(jsonPath("$.items[49].roomSequence")
                        .value(120))
                .andExpect(jsonPath("$.items[49].senderUserId")
                        .value("owner-1"))
                .andExpect(jsonPath("$.nextBeforeSequence")
                        .value(71))
                .andExpect(jsonPath("$.nextAfterSequence")
                        .value(nullValue()))
                .andExpect(jsonPath("$.hasMore").value(true));

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                roomId)
                        .with(jwt("owner-1", ChatScopes.ROOMS_READ))
                        .queryParam("beforeSequence", "71"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(50))
                .andExpect(jsonPath("$.items[0].roomSequence")
                        .value(21))
                .andExpect(jsonPath("$.items[49].roomSequence")
                        .value(70))
                .andExpect(jsonPath("$.nextBeforeSequence")
                        .value(21))
                .andExpect(jsonPath("$.nextAfterSequence")
                        .value(nullValue()))
                .andExpect(jsonPath("$.hasMore").value(true));

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                roomId)
                        .with(jwt("owner-1", ChatScopes.ROOMS_READ))
                        .queryParam("beforeSequence", "21"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(20))
                .andExpect(jsonPath("$.items[0].roomSequence")
                        .value(1))
                .andExpect(jsonPath("$.items[19].roomSequence")
                        .value(20))
                .andExpect(jsonPath("$.nextBeforeSequence")
                        .value(nullValue()))
                .andExpect(jsonPath("$.nextAfterSequence")
                        .value(nullValue()))
                .andExpect(jsonPath("$.hasMore").value(false));
    }

    @Test
    void explicitAfterSequenceSupportsForwardRecovery()
            throws Exception {
        String roomId = createRoom("owner-1");
        appendMessages(roomId, "owner-1", 120);

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                roomId)
                        .with(jwt("owner-1", ChatScopes.ROOMS_READ))
                        .queryParam("afterSequence", "100")
                        .queryParam("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(10))
                .andExpect(jsonPath("$.items[0].roomSequence")
                        .value(101))
                .andExpect(jsonPath("$.items[9].roomSequence")
                        .value(110))
                .andExpect(jsonPath("$.nextBeforeSequence")
                        .value(nullValue()))
                .andExpect(jsonPath("$.nextAfterSequence")
                        .value(110))
                .andExpect(jsonPath("$.hasMore").value(true));

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                roomId)
                        .with(jwt("owner-1", ChatScopes.ROOMS_READ))
                        .queryParam("afterSequence", "110")
                        .queryParam("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(10))
                .andExpect(jsonPath("$.items[0].roomSequence")
                        .value(111))
                .andExpect(jsonPath("$.items[9].roomSequence")
                        .value(120))
                .andExpect(jsonPath("$.nextBeforeSequence")
                        .value(nullValue()))
                .andExpect(jsonPath("$.nextAfterSequence")
                        .value(nullValue()))
                .andExpect(jsonPath("$.hasMore").value(false));
    }

    @Test
    void emptyRoomReturnsEmptyLatestPage() throws Exception {
        String roomId = createRoom("owner-1");

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages",
                                roomId)
                        .with(jwt("owner-1", ChatScopes.ROOMS_READ)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.nextBeforeSequence")
                        .value(nullValue()))
                .andExpect(jsonPath("$.nextAfterSequence")
                        .value(nullValue()))
                .andExpect(jsonPath("$.hasMore").value(false));
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
    void historyValidatesCursorAndLimit()
            throws Exception {
        for (String query : new String[]{
                "beforeSequence=0",
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
                                "room-1")
                        .with(jwt("owner-1", ChatScopes.ROOMS_READ))
                        .queryParam("beforeSequence", "10")
                        .queryParam("afterSequence", "5"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code")
                        .value("INVALID_REQUEST"));

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

    private void appendMessages(
            String roomId,
            String senderUserId,
            int count
    ) {
        for (int sequence = 1; sequence <= count; sequence++) {
            append(
                    roomId,
                    senderUserId,
                    "message " + sequence);
        }
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
