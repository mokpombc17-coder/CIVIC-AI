package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.message.ChatMessageMutationStore;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.DeleteChatMessageMutation;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
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

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class ChatMessageContextApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RoomCommandService roomCommandService;

    @Autowired
    private ChatMessageStore messageStore;

    @Autowired
    private ChatMessageMutationStore mutationStore;

    @Test
    void returnsTargetWindowAscendingWithContinuationHints()
            throws Exception {
        String roomId = createRoom();
        List<StoredChatMessage> messages = append(roomId, 7);
        String targetId = messages.get(3).message().messageId();

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages/"
                                        + "{messageId}/context",
                                roomId,
                                targetId)
                        .with(jwt("owner-1"))
                        .queryParam("before", "2")
                        .queryParam("after", "2"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        containsString("no-store")))
                .andExpect(jsonPath("$.targetMessageId").value(targetId))
                .andExpect(jsonPath("$.targetRoomSequence").value(4))
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.items[0].roomSequence").value(2))
                .andExpect(jsonPath("$.items[1].roomSequence").value(3))
                .andExpect(jsonPath("$.items[2].roomSequence").value(4))
                .andExpect(jsonPath("$.items[3].roomSequence").value(5))
                .andExpect(jsonPath("$.items[4].roomSequence").value(6))
                .andExpect(jsonPath("$.items[2].senderMembershipId")
                        .value("membership-owner-1"))
                .andExpect(jsonPath("$.items[2].senderUserId")
                        .doesNotExist())
                .andExpect(jsonPath("$.hasOlder").value(true))
                .andExpect(jsonPath("$.hasNewer").value(true))
                .andExpect(jsonPath("$.nextBeforeSequence").value(2))
                .andExpect(jsonPath("$.nextAfterSequence").value(6));
    }

    @Test
    void returnsDeletedTargetAsTombstone() throws Exception {
        String roomId = createRoom();
        StoredChatMessage target = append(roomId, 1).getFirst();
        mutationStore.delete(new DeleteChatMessageMutation(
                "owner-1",
                UUID.randomUUID().toString(),
                roomId,
                target.message().messageId()));

        mockMvc.perform(get(
                                "/api/v1/rooms/{roomId}/messages/"
                                        + "{messageId}/context",
                                roomId,
                                target.message().messageId())
                        .with(jwt("owner-1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].state")
                        .value("DELETED_BY_AUTHOR"))
                .andExpect(jsonPath("$.items[0].content").isEmpty())
                .andExpect(jsonPath("$.items[0].deletedAt").isNotEmpty());
    }

    @Test
    void hidesMissingOtherRoomAndPreJoinTargets() throws Exception {
        String roomId = createRoom();
        StoredChatMessage beforeJoin = append(roomId, 1).getFirst();
        roomCommandService.joinRoom(new JoinRoomCommand(
                "user-2",
                UUID.randomUUID().toString(),
                roomId));
        String otherRoomId = createRoom();
        StoredChatMessage otherRoom = append(otherRoomId, 1).getFirst();

        assertNotFound(roomId, "missing-message", "owner-1");
        assertNotFound(
                roomId,
                otherRoom.message().messageId(),
                "owner-1");
        assertNotFound(
                roomId,
                beforeJoin.message().messageId(),
                "user-2");
    }

    @Test
    void rejectsNonMemberClosedRoomAndInvalidWindow()
            throws Exception {
        String roomId = createRoom();
        StoredChatMessage target = append(roomId, 1).getFirst();

        mockMvc.perform(contextRequest(
                        roomId,
                        target.message().messageId(),
                        "outsider"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        mockMvc.perform(contextRequest(
                                roomId,
                                target.message().messageId(),
                                "owner-1")
                        .queryParam("before", "51"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        roomCommandService.closeRoom(new CloseRoomCommand(
                "owner-1",
                UUID.randomUUID().toString(),
                roomId));
        mockMvc.perform(contextRequest(
                        roomId,
                        target.message().messageId(),
                        "owner-1"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("MESSAGE_SEARCH_NOT_AVAILABLE"));
    }

    private void assertNotFound(
            String roomId,
            String messageId,
            String userId
    ) throws Exception {
        mockMvc.perform(contextRequest(roomId, messageId, userId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("MESSAGE_NOT_FOUND"));
    }

    private org.springframework.test.web.servlet.request
            .MockHttpServletRequestBuilder contextRequest(
            String roomId,
            String messageId,
            String userId
    ) {
        return get(
                        "/api/v1/rooms/{roomId}/messages/"
                                + "{messageId}/context",
                        roomId,
                        messageId)
                .with(jwt(userId));
    }

    private String createRoom() {
        return roomCommandService.createRoom(new CreateRoomCommand(
                        "owner-1",
                        UUID.randomUUID().toString(),
                        "Context room",
                        List.of(RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN))
                .result()
                .roomId();
    }

    private List<StoredChatMessage> append(
            String roomId,
            int count
    ) {
        List<StoredChatMessage> stored = new ArrayList<>();
        for (int sequence = 1; sequence <= count; sequence++) {
            stored.add((StoredChatMessage) messageStore.append(
                    new NewChatMessage(
                            roomId,
                            "owner-1",
                            "membership-owner-1",
                            UUID.randomUUID().toString(),
                            "message " + sequence)));
        }
        return stored;
    }

    private JwtRequestPostProcessor jwt(String subject) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(jwt -> jwt.subject(subject))
                .authorities(new SimpleGrantedAuthority(
                        ChatScopes.authority(ChatScopes.ROOMS_READ)));
    }
}
