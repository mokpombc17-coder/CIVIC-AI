package com.hamcheeze.chat.export;

import com.hamcheeze.chat.export.mongo.MongoAdminRoomConversationExportJobDocument;
import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditWriter;
import com.hamcheeze.chat.message.audit.mongo.MongoChatMessageAuditEventDocument;
import com.hamcheeze.chat.message.audit.mongo.MongoRoomMessageAuditSequenceDocument;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomCreationResult;
import com.hamcheeze.chat.room.RoomMembershipTransitions;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayInputStream;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class AdminRoomConversationExportApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    private static final String ROOM_ID = "admin-conversation-export-room";
    private static final Instant FROM =
            Instant.parse("2026-08-24T02:00:00Z");
    private static final Instant MESSAGE_CREATED_AT =
            Instant.parse("2026-08-24T02:20:00Z");
    private static final Instant TO =
            Instant.parse("2026-08-24T03:00:00Z");
    private static final JsonMapper JSON = JsonMapper.builder().build();

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
                MongoAdminRoomConversationExportJobDocument.COLLECTION_NAME);
    }

    @Test
    void exportsRequestedRangeAndCompletesAdminJob() throws Exception {
        seedRoom();
        appendMessage();

        MvcResult result = mockMvc.perform(post(
                        "/api/v1/admin/rooms/" + ROOM_ID
                                + "/conversation-exports")
                        .accept("application/zip")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fromInclusive": "%s",
                                  "toExclusive": "%s"
                                }
                                """.formatted(FROM, TO))
                        .with(jwt().jwt(token -> token.subject("admin-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .CHAT_AUDIT_EXPORTS)))))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CONTENT_TYPE, "application/zip"))
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL,
                        "no-store, no-cache, must-revalidate"))
                .andExpect(header().exists("X-Export-Id"))
                .andExpect(header().exists("X-Export-SHA256"))
                .andReturn();

        byte[] zipBytes = result.getResponse().getContentAsByteArray();
        String exportId = result.getResponse().getHeader("X-Export-Id");
        String sha256 = result.getResponse().getHeader("X-Export-SHA256");
        assertThat(sha256).isEqualTo(sha256(zipBytes));
        assertThat(result.getResponse().getContentLengthLong())
                .isEqualTo(zipBytes.length);
        assertThat(entryNames(zipBytes)).containsExactlyInAnyOrder(
                "manifest.json",
                "messages.jsonl",
                "message_changes.jsonl",
                "transcript.html");

        JsonNode manifest = JSON.readTree(
                zipEntry(zipBytes, "manifest.json"));
        assertThat(manifest.get("contract").stringValue())
                .isEqualTo("admin-room-conversation-export");
        assertThat(manifest.get("schemaVersion").intValue()).isEqualTo(1);
        assertThat(manifest.get("roomId").stringValue()).isEqualTo(ROOM_ID);
        assertThat(manifest.get("range").get("fromInclusive").stringValue())
                .isEqualTo(FROM.toString());
        assertThat(manifest.get("range").get("toExclusive").stringValue())
                .isEqualTo(TO.toString());
        assertThat(manifest.get("counts").get("messages").longValue())
                .isEqualTo(1);
        assertThat(manifest.get("counts").get("changes").longValue())
                .isEqualTo(1);

        MongoAdminRoomConversationExportJobDocument job =
                mongoOperations.findById(
                        exportId,
                        MongoAdminRoomConversationExportJobDocument.class,
                        MongoAdminRoomConversationExportJobDocument
                                .COLLECTION_NAME);
        assertThat(job).isNotNull();
        assertThat(job.status()).isEqualTo(ChatExportStatus.SUCCEEDED);
        assertThat(job.requestedByAdminId()).isEqualTo("admin-1");
        assertThat(job.fromInclusive()).isEqualTo(FROM);
        assertThat(job.toExclusive()).isEqualTo(TO);
        assertThat(job.messageCount()).isEqualTo(1);
        assertThat(job.changeCount()).isEqualTo(1);
        assertThat(job.artifactSizeBytes()).isEqualTo(zipBytes.length);
        assertThat(job.artifactSha256()).isEqualTo(sha256);
        assertThat(job.deliveryCompletedAt()).isNotNull();
        assertThat(job.failureCode()).isNull();
    }

    private void seedRoom() {
        RoomCreationResult creation = RoomMembershipTransitions.createRoom(
                ROOM_ID,
                "관리자 통계 방",
                "기간 내 대화 지표 검증",
                List.of(RoomCategory.POLICY),
                "membership-owner-admin-export",
                "owner-admin-export",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                Instant.parse("2026-01-01T00:00:00Z"));
        roomStore.insert(creation.room());
        membershipStore.insert(creation.ownerMembership());
    }

    private void appendMessage() {
        ChatMessage message = new ChatMessage(
                "admin-export-message-1",
                ROOM_ID,
                1,
                "user-1",
                "membership-user-1",
                "client-message-1",
                "교통 정책 의견",
                MessageState.ACTIVE,
                true,
                1,
                MESSAGE_CREATED_AT,
                MESSAGE_CREATED_AT,
                null);
        auditWriter.appendCreated(
                message,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);
    }

    private List<String> entryNames(byte[] zip) throws Exception {
        List<String> names = new ArrayList<>();
        try (ZipInputStream input = new ZipInputStream(
                new ByteArrayInputStream(zip))) {
            for (var entry = input.getNextEntry(); entry != null;
                    entry = input.getNextEntry()) {
                names.add(entry.getName());
            }
        }
        return names;
    }

    private byte[] zipEntry(byte[] zip, String name) throws Exception {
        try (ZipInputStream input = new ZipInputStream(
                new ByteArrayInputStream(zip))) {
            for (var entry = input.getNextEntry(); entry != null;
                    entry = input.getNextEntry()) {
                if (entry.getName().equals(name)) {
                    return input.readAllBytes();
                }
            }
        }
        throw new AssertionError("Missing ZIP entry: " + name);
    }

    private String sha256(byte[] payload) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(payload));
    }
}
