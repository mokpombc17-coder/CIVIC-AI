package com.hamcheeze.chat.export;

import com.hamcheeze.chat.export.mongo.MongoChatExportJobDocument;
import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditWriter;
import com.hamcheeze.chat.message.audit.mongo.MongoChatMessageAuditEventDocument;
import com.hamcheeze.chat.message.audit.mongo.MongoRoomMessageAuditSequenceDocument;
import com.hamcheeze.chat.room.RoomMembershipTransitions;
import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Set;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class ChatExportApiIntegrationTest extends MongoRuntimeIntegrationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-11T06:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ChatMessageAuditWriter auditWriter;

    @BeforeEach
    void clearExportDocuments() {
        mongoOperations.remove(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoChatMessageAuditEventDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoRoomMessageAuditSequenceDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoChatExportJobDocument.COLLECTION_NAME);
    }

    @Test
    void fullAndIncrementalExportUseAdminScopedCheckpoint()
            throws Exception {
        seedActiveRoom("room-1", "user-1");
        auditWriter.appendCreated(
                message(),
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);

        MvcResult full = mockMvc.perform(post(
                        "/api/v1/admin/rooms/room-1/exports")
                        .with(admin("admin-1"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept("application/zip")
                        .content("{\"mode\":\"FULL\"}"))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Cache-Control",
                        "no-store, no-cache, must-revalidate"))
                .andExpect(header().string(
                        "X-Content-Type-Options",
                        "nosniff"))
                .andReturn();

        byte[] fullZip = full.getResponse().getContentAsByteArray();
        assertThat(full.getResponse().getHeader("X-Export-SHA256"))
                .isEqualTo(sha256(fullZip));
        assertThat(full.getResponse().getContentLengthLong())
                .isEqualTo(fullZip.length);
        assertThat(entries(fullZip)).containsExactlyInAnyOrder(
                "manifest.json",
                "room.json",
                "participants.jsonl",
                "events.jsonl",
                "transcript.html");

        mockMvc.perform(post("/api/v1/admin/rooms/room-1/exports")
                        .with(admin("admin-2"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"INCREMENTAL\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code")
                        .value("CHAT_EXPORT_BASE_NOT_FOUND"));

        byte[] incrementalZip = mockMvc.perform(post(
                        "/api/v1/admin/rooms/room-1/exports")
                        .with(admin("admin-1"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"INCREMENTAL\"}"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray();
        assertThat(entries(incrementalZip)).contains("changes.html");
        assertThat(zipEntry(incrementalZip, "events.jsonl")).isEmpty();
    }

    @Test
    void closedRoomCanBeExportedWithoutAdminMembership()
            throws Exception {
        seedActiveRoom("closed-room", "owner-user");
        var room = roomStore.findById("closed-room").orElseThrow();
        var membership = membershipStore.findByRoomIdAndUserId(
                "closed-room",
                "owner-user").orElseThrow();
        var closed = RoomMembershipTransitions.closeRoom(
                room,
                membership,
                "owner-user",
                CREATED_AT.plusSeconds(1));
        assertThat(roomStore.replaceIfVersionMatches(
                closed.room(),
                room.version())).isTrue();
        assertThat(membershipStore.replaceIfVersionMatches(
                closed.ownerMembership(),
                membership.version())).isTrue();

        byte[] zip = mockMvc.perform(post(
                        "/api/v1/admin/rooms/closed-room/exports")
                        .with(admin("admin-without-membership"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mode\":\"FULL\"}"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray();

        assertThat(zipEntry(zip, "room.json"))
                .contains("\"status\":\"CLOSED\"");
        assertThat(zipEntry(zip, "events.jsonl")).isEmpty();
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor
    admin(String adminId) {
        return jwt().jwt(token -> token.subject(adminId))
                .authorities(new SimpleGrantedAuthority(
                        ChatScopes.authority(
                                ChatScopes.CHAT_AUDIT_EXPORTS)));
    }

    private ChatMessage message() {
        return new ChatMessage(
                "message-1",
                "room-1",
                1,
                "user-1",
                "membership-room-1-user-1",
                "client-1",
                "감사 대상 메시지",
                MessageState.ACTIVE,
                true,
                1,
                CREATED_AT,
                CREATED_AT,
                null);
    }

    private Set<String> entries(byte[] zip) throws Exception {
        java.util.Set<String> names = new java.util.HashSet<>();
        try (ZipInputStream input = new ZipInputStream(
                new ByteArrayInputStream(zip),
                StandardCharsets.UTF_8)) {
            java.util.zip.ZipEntry entry;
            while ((entry = input.getNextEntry()) != null) {
                names.add(entry.getName());
            }
        }
        return names;
    }

    private String zipEntry(byte[] zip, String target) throws Exception {
        try (ZipInputStream input = new ZipInputStream(
                new ByteArrayInputStream(zip),
                StandardCharsets.UTF_8)) {
            java.util.zip.ZipEntry entry;
            while ((entry = input.getNextEntry()) != null) {
                if (target.equals(entry.getName())) {
                    return new String(
                            input.readAllBytes(),
                            StandardCharsets.UTF_8);
                }
            }
        }
        throw new AssertionError("Missing ZIP entry: " + target);
    }

    private String sha256(byte[] payload) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(payload));
    }
}
