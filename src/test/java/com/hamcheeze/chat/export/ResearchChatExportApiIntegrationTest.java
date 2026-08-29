package com.hamcheeze.chat.export;

import com.hamcheeze.chat.export.mongo.MongoResearchChatExportJobDocument;
import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
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
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class ResearchChatExportApiIntegrationTest
        extends MongoRuntimeIntegrationTest {

    private static final String ROOM_ID = "research-non-empty-room";
    private static final Instant MESSAGE_ONE_CREATED_AT =
            Instant.parse("2026-08-24T02:20:00Z");
    private static final Instant MESSAGE_ONE_UPDATED_AT =
            Instant.parse("2026-08-24T02:25:00Z");
    private static final Instant MESSAGE_TWO_CREATED_AT =
            Instant.parse("2026-08-24T02:21:00Z");
    private static final Instant MESSAGE_TWO_DELETED_AT =
            Instant.parse("2026-08-24T02:27:00Z");
    private static final Set<String> MESSAGE_FIELDS = Set.of(
            "messageSequence", "userId", "content", "createdAt",
            "deleted");
    private static final Set<String> CHANGE_FIELDS = Set.of(
            "changeSequence", "messageSequence", "userId", "changeType",
            "content", "changedAt");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ChatMessageAuditWriter auditWriter;

    @BeforeEach
    void clearResearchExportDocuments() {
        mongoOperations.remove(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoChatMessageAuditEventDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoRoomMessageAuditSequenceDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new org.springframework.data.mongodb.core.query.Query(),
                MongoResearchChatExportJobDocument.COLLECTION_NAME);
    }

    @Test
    void exportsNonEmptyMongoAuditLedgerThroughHttpAndCompletesJob()
            throws Exception {
        seedResearchRoom();
        assertThat(membershipStore.findByRoomIdAndUserId(
                ROOM_ID, "researcher-1")).isEmpty();
        List<ChatMessageAuditEvent> auditEvents = appendAuditEvents();

        MvcResult result = mockMvc.perform(post(
                        "/api/v1/research/rooms/" + ROOM_ID + "/exports")
                        .accept("application/zip")
                        .with(jwt().jwt(token ->
                                        token.subject("researcher-1"))
                                .authorities(new SimpleGrantedAuthority(
                                        ChatScopes.authority(
                                                ChatScopes
                                                        .CHAT_RESEARCH_EXPORTS)))))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CONTENT_TYPE, "application/zip"))
                .andExpect(header().string(
                        HttpHeaders.CACHE_CONTROL,
                        "no-store, no-cache, must-revalidate"))
                .andExpect(header().string("Pragma", "no-cache"))
                .andExpect(header().string(
                        "X-Content-Type-Options", "nosniff"))
                .andExpect(header().exists("X-Export-Id"))
                .andExpect(header().exists("X-Export-SHA256"))
                .andReturn();

        byte[] zipBytes = result.getResponse().getContentAsByteArray();
        String exportId = result.getResponse().getHeader("X-Export-Id");
        String artifactSha256 = result.getResponse().getHeader(
                "X-Export-SHA256");
        assertThat(result.getResponse().getHeader(
                HttpHeaders.CONTENT_DISPOSITION)).isEqualTo(
                "attachment; filename=\"research-room-export-"
                        + exportId + ".zip\"");
        assertThat(result.getResponse().getContentLengthLong())
                .isEqualTo(zipBytes.length);
        assertThat(artifactSha256).isEqualTo(sha256(zipBytes));

        ZipContents zip = unzip(zipBytes);
        assertThat(zip.entryNames()).hasSize(4)
                .containsExactlyInAnyOrder(
                        "manifest.json", "messages.jsonl",
                        "message_changes.jsonl", "transcript.html");
        assertThat(zip.entries()).hasSize(4);

        verifyMessages(zip.entries().get("messages.jsonl"));
        verifyChanges(zip.entries().get("message_changes.jsonl"),
                auditEvents);
        verifyManifest(zip.entries());
        verifyTranscript(zip.entries().get("transcript.html"));
        verifySucceededJob(exportId, artifactSha256, zipBytes.length);
    }

    private void seedResearchRoom() {
        RoomCreationResult creation = RoomMembershipTransitions.createRoom(
                ROOM_ID,
                "연구 <Room>",
                "설명 & 검증",
                List.of(RoomCategory.POLICY),
                "membership-research-owner",
                "research-owner",
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                Instant.parse("2026-01-01T00:00:00Z"));
        roomStore.insert(creation.room());
        membershipStore.insert(creation.ownerMembership());
    }

    private List<ChatMessageAuditEvent> appendAuditEvents() {
        ChatMessage firstCreated = message(
                "message-1", 1, "user-1", "membership-user-1",
                "client-1", "초기 의견", 1, MESSAGE_ONE_CREATED_AT,
                MESSAGE_ONE_CREATED_AT, MessageState.ACTIVE, null);
        ChatMessage firstUpdated = message(
                "message-1", 1, "user-1", "membership-user-1",
                "client-1", "수정된 의견", 2, MESSAGE_ONE_CREATED_AT,
                MESSAGE_ONE_UPDATED_AT, MessageState.ACTIVE, null);
        ChatMessage secondCreated = message(
                "message-2", 2, "user-2", "membership-user-2",
                "client-2", "삭제할 의견", 1, MESSAGE_TWO_CREATED_AT,
                MESSAGE_TWO_CREATED_AT, MessageState.ACTIVE, null);
        ChatMessage secondDeleted = message(
                "message-2", 2, "user-2", "membership-user-2",
                "client-2", null, 2, MESSAGE_TWO_CREATED_AT,
                MESSAGE_TWO_DELETED_AT, MessageState.DELETED_BY_AUTHOR,
                MESSAGE_TWO_DELETED_AT);

        return List.of(
                auditWriter.appendCreated(
                        firstCreated, "user-1",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT),
                auditWriter.appendUpdated(
                        firstCreated, firstUpdated, "user-1",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT),
                auditWriter.appendCreated(
                        secondCreated, "user-2",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT),
                auditWriter.appendDeleted(
                        secondCreated, secondDeleted, "user-2",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT));
    }

    private ChatMessage message(
            String messageId,
            long roomSequence,
            String userId,
            String membershipId,
            String clientMessageId,
            String content,
            long version,
            Instant createdAt,
            Instant updatedAt,
            MessageState state,
            Instant deletedAt
    ) {
        return new ChatMessage(
                messageId, ROOM_ID, roomSequence, userId, membershipId,
                clientMessageId, content, state, true, version, createdAt,
                updatedAt, deletedAt);
    }

    private void verifyMessages(byte[] payload) throws Exception {
        List<JsonNode> messages = jsonLines(payload);
        assertThat(messages).hasSize(2);
        assertFields(messages, MESSAGE_FIELDS);

        assertThat(messages.get(0).get("messageSequence").longValue())
                .isEqualTo(1);
        assertThat(messages.get(0).get("userId").stringValue())
                .isEqualTo("user-1");
        assertThat(messages.get(0).get("content").stringValue())
                .isEqualTo("수정된 의견");
        assertThat(messages.get(0).get("createdAt").stringValue())
                .isEqualTo(MESSAGE_ONE_CREATED_AT.toString());
        assertThat(messages.get(0).get("deleted").booleanValue()).isFalse();

        assertThat(messages.get(1).get("messageSequence").longValue())
                .isEqualTo(2);
        assertThat(messages.get(1).get("userId").stringValue())
                .isEqualTo("user-2");
        assertThat(messages.get(1).get("content").stringValue())
                .isEqualTo("삭제할 의견");
        assertThat(messages.get(1).get("createdAt").stringValue())
                .isEqualTo(MESSAGE_TWO_CREATED_AT.toString());
        assertThat(messages.get(1).get("deleted").booleanValue()).isTrue();
    }

    private void verifyChanges(
            byte[] payload,
            List<ChatMessageAuditEvent> auditEvents
    ) throws Exception {
        List<JsonNode> changes = jsonLines(payload);
        assertThat(changes).hasSize(4);
        assertFields(changes, CHANGE_FIELDS);
        assertThat(changes.stream()
                .map(node -> node.get("changeSequence").longValue()))
                .containsExactly(1L, 2L, 3L, 4L);

        assertChange(changes.get(0), 1, "user-1", "CREATED",
                "초기 의견", auditEvents.get(0));
        assertChange(changes.get(1), 1, "user-1", "UPDATED",
                "수정된 의견", auditEvents.get(1));
        assertChange(changes.get(2), 2, "user-2", "CREATED",
                "삭제할 의견", auditEvents.get(2));
        assertChange(changes.get(3), 2, "user-2", "DELETED",
                "삭제할 의견", auditEvents.get(3));
    }

    private void assertChange(
            JsonNode change,
            long messageSequence,
            String userId,
            String changeType,
            String content,
            ChatMessageAuditEvent auditEvent
    ) {
        assertThat(change.get("messageSequence").longValue())
                .isEqualTo(messageSequence);
        assertThat(change.get("userId").stringValue()).isEqualTo(userId);
        assertThat(change.get("changeType").stringValue())
                .isEqualTo(changeType);
        assertThat(change.get("content").stringValue()).isEqualTo(content);
        assertThat(change.get("content").isNull()).isFalse();
        assertThat(change.get("changedAt").stringValue())
                .isEqualTo(auditEvent.occurredAt().toString());
    }

    private void verifyManifest(Map<String, byte[]> entries)
            throws Exception {
        JsonNode manifest = JSON.readTree(entries.get("manifest.json"));
        assertThat(manifest.get("roomId").stringValue()).isEqualTo(ROOM_ID);
        assertThat(manifest.get("schemaVersion").intValue()).isEqualTo(1);
        assertThat(manifest.has("roomCategoryIds")).isFalse();
        assertThat(manifest.has("roomCategories")).isFalse();
        assertThat(manifest.has("categories")).isFalse();
        assertThat(manifest.get("capturedChangeSequence").longValue())
                .isEqualTo(4);
        assertThat(manifest.get("identityMode").stringValue())
                .isEqualTo("INTERNAL_USER_ID");
        assertThat(manifest.get("messageRepresentation").stringValue())
                .isEqualTo("FINAL_CONTENT");
        assertThat(manifest.get("deletedContentIncluded").booleanValue())
                .isTrue();
        assertThat(manifest.get("changeHistoryIncluded").booleanValue())
                .isTrue();

        JsonNode counts = manifest.get("counts");
        assertThat(counts.get("messages").longValue()).isEqualTo(2);
        assertThat(counts.get("changes").longValue()).isEqualTo(4);
        assertThat(counts.get("created").longValue()).isEqualTo(2);
        assertThat(counts.get("updated").longValue()).isEqualTo(1);
        assertThat(counts.get("deleted").longValue()).isEqualTo(1);

        Set<String> described = new LinkedHashSet<>();
        for (JsonNode descriptor : manifest.get("files")) {
            String name = descriptor.get("name").stringValue();
            described.add(name);
            byte[] payload = entries.get(name);
            assertThat(payload).isNotNull();
            assertThat(descriptor.get("sizeBytes").longValue())
                    .isEqualTo(payload.length);
            assertThat(descriptor.get("sha256").stringValue())
                    .isEqualTo(sha256(payload));
        }
        assertThat(described).containsExactly(
                "messages.jsonl", "message_changes.jsonl",
                "transcript.html");
    }

    private void verifyTranscript(byte[] payload) {
        String transcript = new String(payload, StandardCharsets.UTF_8);
        assertThat(transcript)
                .contains("연구 &lt;Room&gt;")
                .contains("설명 &amp; 검증")
                .contains("user-1")
                .contains("user-2")
                .contains("수정된 의견")
                .contains("삭제할 의견")
                .contains("수정됨")
                .contains("삭제됨")
                .contains("default-src 'none'")
                .contains("script-src 'none'")
                .doesNotContain("Participants")
                .doesNotContain("displayName");
        assertThat(transcript.indexOf("user-1"))
                .isLessThan(transcript.indexOf("user-2"));
    }

    private void verifySucceededJob(
            String exportId,
            String artifactSha256,
            long artifactSize
    ) {
        MongoResearchChatExportJobDocument job = mongoOperations.findById(
                exportId,
                MongoResearchChatExportJobDocument.class,
                MongoResearchChatExportJobDocument.COLLECTION_NAME);
        assertThat(job).isNotNull();
        assertThat(job.status()).isEqualTo(ChatExportStatus.SUCCEEDED);
        assertThat(job.roomId()).isEqualTo(ROOM_ID);
        assertThat(job.requestedByResearcherId())
                .isEqualTo("researcher-1");
        assertThat(job.capturedChangeSequence()).isEqualTo(4);
        assertThat(job.messageCount()).isEqualTo(2);
        assertThat(job.changeCount()).isEqualTo(4);
        assertThat(job.createdCount()).isEqualTo(2);
        assertThat(job.updatedCount()).isEqualTo(1);
        assertThat(job.deletedCount()).isEqualTo(1);
        assertThat(job.artifactSizeBytes()).isEqualTo(artifactSize);
        assertThat(job.artifactSha256()).isEqualTo(artifactSha256);
        assertThat(job.deliveryCompletedAt()).isNotNull();
        assertThat(job.failureCode()).isNull();
    }

    private void assertFields(
            List<JsonNode> records,
        Set<String> expected
    ) {
        for (JsonNode record : records) {
            Set<String> actual = new LinkedHashSet<>(
                    record.propertyNames());
            assertThat(actual).containsExactlyInAnyOrderElementsOf(expected);
        }
    }

    private List<JsonNode> jsonLines(byte[] payload) throws Exception {
        List<JsonNode> records = new ArrayList<>();
        for (String line : new String(payload, StandardCharsets.UTF_8)
                .lines().toList()) {
            if (!line.isBlank()) {
                records.add(JSON.readTree(line));
            }
        }
        return records;
    }

    private ZipContents unzip(byte[] payload) throws Exception {
        List<String> names = new ArrayList<>();
        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (ZipInputStream input = new ZipInputStream(
                new ByteArrayInputStream(payload),
                StandardCharsets.UTF_8)) {
            for (var entry = input.getNextEntry(); entry != null;
                    entry = input.getNextEntry()) {
                names.add(entry.getName());
                assertThat(entries.put(entry.getName(), input.readAllBytes()))
                        .as("duplicate ZIP entry %s", entry.getName())
                        .isNull();
            }
        }
        return new ZipContents(names, entries);
    }

    private String sha256(byte[] payload) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(payload));
    }

    private record ZipContents(
            List<String> entryNames,
            Map<String, byte[]> entries
    ) {
    }
}
