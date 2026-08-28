package com.hamcheeze.chat.export;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ResearchChatExportArtifactGeneratorTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-24T02:20:00Z");
    private static final String EXPORT_ID =
            "11111111-1111-1111-1111-111111111111";

    @TempDir
    Path tempDirectory;

    @Test
    void exportsFinalMessagesAndEveryChangeWithExactPublicFields()
            throws Exception {
        List<ChatMessageAuditEvent> events = revisions();
        Fixture fixture = fixture(events, ignored -> { });

        ResearchChatExportArtifact artifact = fixture.generator().generate(
                job(events.size()), snapshot(events.size()),
                fixture.workspace());

        assertThat(artifact.messageCount()).isEqualTo(2);
        assertThat(artifact.changeCount()).isEqualTo(6);
        assertThat(artifact.sha256()).isEqualTo(sha256(artifact.path()));
        assertThat(Files.size(artifact.path())).isEqualTo(
                artifact.sizeBytes());

        try (ZipFile zip = new ZipFile(artifact.path().toFile())) {
            assertThat(zip.stream().map(ZipEntry::getName).toList())
                    .containsExactlyInAnyOrder(
                            "manifest.json",
                            "messages.jsonl",
                            "message_changes.jsonl",
                            "transcript.html");

            List<String> messageLines = entry(zip, "messages.jsonl")
                    .lines().toList();
            assertThat(messageLines).hasSize(2);
            Map<String, Object> first = map(messageLines.get(0));
            Map<String, Object> second = map(messageLines.get(1));
            assertThat(first.keySet()).containsExactlyInAnyOrder(
                    "messageSequence", "userId", "content",
                    "createdAt", "deleted");
            assertThat(second.keySet()).containsExactlyInAnyOrder(
                    "messageSequence", "userId", "content",
                    "createdAt", "deleted");
            assertThat(first)
                    .containsEntry("messageSequence", 1)
                    .containsEntry("userId", "user-1")
                    .containsEntry("content", "v3 <final>")
                    .containsEntry("deleted", true);
            assertThat(second)
                    .containsEntry("messageSequence", 2)
                    .containsEntry("content", "delete & keep")
                    .containsEntry("deleted", true);

            List<String> changes = entry(zip, "message_changes.jsonl")
                    .lines().toList();
            assertThat(changes).hasSize(6);
            for (String line : changes) {
                assertThat(map(line).keySet()).containsExactlyInAnyOrder(
                        "changeSequence", "messageSequence", "userId",
                        "changeType", "content", "changedAt");
                assertThat(map(line).get("content")).isNotNull();
            }
            assertThat(changes.stream()
                    .map(this::map)
                    .map(value -> value.get("changeSequence")))
                    .containsExactly(1, 2, 3, 4, 5, 6);
            assertThat(map(changes.get(3)))
                    .containsEntry("changeType", "DELETED")
                    .containsEntry("content", "delete & keep");
            assertThat(map(changes.get(5)))
                    .containsEntry("changeType", "DELETED")
                    .containsEntry("content", "v3 <final>");

            String transcript = entry(zip, "transcript.html");
            assertThat(transcript)
                    .contains("연구 &lt;Room&gt;")
                    .contains("user-1")
                    .contains("v3 &lt;final&gt;")
                    .contains("delete &amp; keep")
                    .contains("수정됨 · 삭제됨")
                    .contains("default-src 'none'")
                    .contains("script-src 'none'")
                    .doesNotContain("Participants")
                    .doesNotContain("displayName");

            JsonNode manifest = JsonMapper.builder().build()
                    .readTree(entry(zip, "manifest.json"));
            assertThat(manifest.get("schemaVersion").intValue())
                    .isEqualTo(2);
            assertThat(manifest.get("roomCategoryIds").get(0)
                    .stringValue()).isEqualTo("custom-category-id");
            assertThat(manifest.get("capturedChangeSequence").longValue())
                    .isEqualTo(6);
            assertThat(manifest.get("identityMode").stringValue())
                    .isEqualTo("INTERNAL_USER_ID");
            assertThat(manifest.get("counts").get("messages").longValue())
                    .isEqualTo(2);
            assertThat(manifest.get("counts").get("changes").longValue())
                    .isEqualTo(6);
            assertDescriptors(zip, manifest.get("files"));
        }
    }

    @Test
    void emptyRoomProducesEmptyJsonlAndValidTranscript() throws Exception {
        Fixture fixture = fixture(List.of(), ignored -> { });

        ResearchChatExportArtifact artifact = fixture.generator().generate(
                job(0), snapshot(0), fixture.workspace());

        try (ZipFile zip = new ZipFile(artifact.path().toFile())) {
            assertThat(entry(zip, "messages.jsonl")).isEmpty();
            assertThat(entry(zip, "message_changes.jsonl")).isEmpty();
            assertThat(entry(zip, "transcript.html"))
                    .startsWith("<!doctype html>")
                    .endsWith("</body></html>\n");
            JsonNode counts = JsonMapper.builder().build()
                    .readTree(entry(zip, "manifest.json"))
                    .get("counts");
            assertThat(counts.get("messages").longValue()).isZero();
            assertThat(counts.get("changes").longValue()).isZero();
            assertThat(counts.get("created").longValue()).isZero();
            assertThat(counts.get("updated").longValue()).isZero();
            assertThat(counts.get("deleted").longValue()).isZero();
        }
    }

    @Test
    void rejectsLedgerGapsMissingCreateDuplicateIdentityAndEarlyEnd()
            throws Exception {
        ChatMessage created = message("m1", 1, 1, "user-1",
                "membership-1", "v1", MessageState.ACTIVE, 1,
                CREATED_AT, null);
        ChatMessage otherSameSequence = message("m2", 1, 1, "user-2",
                "membership-2", "v2", MessageState.ACTIVE, 1,
                CREATED_AT, null);
        ChatMessage updated = message("m1", 1, 1, "user-1",
                "membership-1", "v2", MessageState.ACTIVE, 2,
                CREATED_AT.plusSeconds(1), null);
        ChatMessage deleted = message("m1", 1, 1, "user-1",
                "membership-1", null, MessageState.DELETED_BY_AUTHOR, 2,
                CREATED_AT.plusSeconds(1), CREATED_AT.plusSeconds(1));

        assertInconsistent(List.of(ChatMessageAuditEvent.created(
                created, 2, "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT)), 2);
        assertInconsistent(List.of(ChatMessageAuditEvent.updated(
                created, updated, 1, "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT)), 1);
        assertInconsistent(List.of(ChatMessageAuditEvent.deleted(
                created, deleted, 1, "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT)), 1);
        assertInconsistent(List.of(
                ChatMessageAuditEvent.created(created, 1, "user-1",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT),
                ChatMessageAuditEvent.created(created, 2, "user-1",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT)), 2);
        assertInconsistent(List.of(
                ChatMessageAuditEvent.created(created, 1, "user-1",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT),
                ChatMessageAuditEvent.created(otherSameSequence, 2, "user-2",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT)), 2);
        assertInconsistent(List.of(ChatMessageAuditEvent.created(
                created, 1, "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT)), 2);
    }

    @Test
    void rejectsWrongRoomBeforeMismatchAndRevisionIdentityChanges()
            throws Exception {
        ChatMessage created = message("m1", 1, 1, "user-1",
                "membership-1", "v1", MessageState.ACTIVE, 1,
                CREATED_AT, null);
        ChatMessage updated = message("m1", 1, 1, "user-1",
                "membership-1", "v2", MessageState.ACTIVE, 2,
                CREATED_AT.plusSeconds(1), null);
        ChatMessage wrongBefore = message("m1", 1, 1, "user-1",
                "membership-1", "wrong", MessageState.ACTIVE, 1,
                CREATED_AT, null);
        ChatMessage wrongRoom = message("m2", 1, 1, "user-2",
                "membership-2", "x", MessageState.ACTIVE, 1,
                CREATED_AT, null, "room-other");
        ChatMessageAuditEvent create = ChatMessageAuditEvent.created(
                created, 1, "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);
        ChatMessageAuditEvent update = ChatMessageAuditEvent.updated(
                created, updated, 2, "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);

        assertInconsistent(List.of(ChatMessageAuditEvent.created(
                wrongRoom, 1, "user-2",
                ChatMessageAuditActorType.ROOM_PARTICIPANT)), 1);
        assertInconsistent(List.of(create, ChatMessageAuditEvent.updated(
                wrongBefore, updated, 2, "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT)), 2);
        assertInconsistent(List.of(create, copy(update, 2,
                "membership-2", "user-1")), 2);
        assertInconsistent(List.of(create, copy(update, 2,
                "membership-1", "user-2")), 2);
        assertInconsistent(List.of(create, copy(update, 2, 2)), 2);
    }

    @Test
    void enforcesReplayAndArtifactBudgets() throws Exception {
        List<ChatMessageAuditEvent> events = revisions();
        Fixture replayLimited = fixture(events,
                properties -> properties.setMaxReplayContentBytes(1));
        assertThatThrownBy(() -> replayLimited.generator().generate(
                job(events.size()), snapshot(events.size()),
                replayLimited.workspace()))
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> assertThat(
                        ((ChatExportException) error).code())
                        .isEqualTo(ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE));

        Fixture zipLimited = fixture(events,
                properties -> properties.setMaxArtifactBytes(64));
        assertThatThrownBy(() -> zipLimited.generator().generate(
                job(events.size()), snapshot(events.size()),
                zipLimited.workspace()))
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> assertThat(
                        ((ChatExportException) error).code())
                        .isEqualTo(ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE));
    }

    private void assertInconsistent(
            List<ChatMessageAuditEvent> events,
            long watermark
    ) throws Exception {
        Fixture fixture = fixture(events, ignored -> { });
        assertThatThrownBy(() -> fixture.generator().generate(
                job(watermark), snapshot(watermark), fixture.workspace()))
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> {
                    ChatExportException exportError =
                            (ChatExportException) error;
                    assertThat(exportError.code()).isEqualTo(
                            ChatExportErrorCode
                                    .CHAT_EXPORT_LEDGER_INCONSISTENT);
                    assertThat(exportError.retryable()).isFalse();
                });
    }

    private Fixture fixture(
            List<ChatMessageAuditEvent> events,
            Consumer<ChatExportProperties> customize
    ) throws IOException {
        ChatExportProperties properties = new ChatExportProperties();
        properties.setTempRoot(tempDirectory.resolve(
                "workspace-" + System.nanoTime()));
        properties.setMinFreeDiskBytes(0);
        properties.setOrphanTtl(Duration.ofHours(1));
        customize.accept(properties);
        Clock clock = Clock.fixed(
                Instant.parse("2026-08-24T03:00:04Z"),
                ZoneOffset.UTC);
        ChatExportTempManager tempManager = new ChatExportTempManager(
                properties, clock, new SimpleMeterRegistry());
        tempManager.initialize();
        ResearchChatExportTempWorkspace workspace =
                tempManager.createResearch(EXPORT_ID);
        return new Fixture(
                new ResearchChatExportArtifactGenerator(
                        new FixedAuditReader(events),
                        JsonMapper.builder().build(),
                        properties,
                        tempManager,
                        clock),
                workspace);
    }

    private ResearchChatExportJob job(long watermark) {
        return ResearchChatExportJob.running(
                EXPORT_ID, "room-1", watermark,
                "researcher-1", CREATED_AT);
    }

    private ResearchChatExportSnapshot snapshot(long watermark) {
        ChatExportRoomSnapshot room = new ChatExportRoomSnapshot(
                "room-1", "연구 <Room>", "설명 & discussion",
                List.of("custom-category-id"),
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED, JoinPolicy.OPEN, "membership-owner",
                1, CREATED_AT, null, CREATED_AT);
        return new ResearchChatExportSnapshot(room, watermark, CREATED_AT);
    }

    private List<ChatMessageAuditEvent> revisions() {
        ChatMessage m1v1 = message("m1", 1, 1, "user-1",
                "membership-1", "v1", MessageState.ACTIVE, 1,
                CREATED_AT, null);
        ChatMessage m1v2 = message("m1", 1, 1, "user-1",
                "membership-1", "v2", MessageState.ACTIVE, 2,
                CREATED_AT.plusSeconds(60), null);
        ChatMessage m1v3 = message("m1", 1, 1, "user-1",
                "membership-1", "v3 <final>", MessageState.ACTIVE, 3,
                CREATED_AT.plusSeconds(120), null);
        ChatMessage m1deleted = message("m1", 1, 1, "user-1",
                "membership-1", null, MessageState.DELETED_BY_AUTHOR, 4,
                CREATED_AT.plusSeconds(180),
                CREATED_AT.plusSeconds(180));
        ChatMessage m2v1 = message("m2", 2, 2, "user-2",
                "membership-2", "delete & keep", MessageState.ACTIVE, 1,
                CREATED_AT, null);
        ChatMessage m2deleted = message("m2", 2, 2, "user-2",
                "membership-2", null, MessageState.DELETED_BY_AUTHOR, 2,
                CREATED_AT.plusSeconds(90), CREATED_AT.plusSeconds(90));

        List<ChatMessageAuditEvent> events = new ArrayList<>();
        events.add(ChatMessageAuditEvent.created(m1v1, 1, "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT));
        events.add(ChatMessageAuditEvent.created(m2v1, 2, "user-2",
                ChatMessageAuditActorType.ROOM_PARTICIPANT));
        events.add(ChatMessageAuditEvent.updated(m1v1, m1v2, 3, "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT));
        events.add(ChatMessageAuditEvent.deleted(m2v1, m2deleted, 4,
                "user-2", ChatMessageAuditActorType.ROOM_PARTICIPANT));
        events.add(ChatMessageAuditEvent.updated(m1v2, m1v3, 5, "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT));
        events.add(ChatMessageAuditEvent.deleted(m1v3, m1deleted, 6,
                "user-1", ChatMessageAuditActorType.ROOM_PARTICIPANT));
        return events;
    }

    private ChatMessage message(
            String id,
            long sequence,
            long clientSequence,
            String userId,
            String membershipId,
            String content,
            MessageState state,
            long version,
            Instant updatedAt,
            Instant deletedAt
    ) {
        return message(id, sequence, clientSequence, userId, membershipId,
                content, state, version, updatedAt, deletedAt, "room-1");
    }

    private ChatMessage message(
            String id,
            long sequence,
            long clientSequence,
            String userId,
            String membershipId,
            String content,
            MessageState state,
            long version,
            Instant updatedAt,
            Instant deletedAt,
            String roomId
    ) {
        return new ChatMessage(id, roomId, sequence, userId, membershipId,
                "client-" + clientSequence, content, state, true, version,
                CREATED_AT, updatedAt, deletedAt);
    }

    private ChatMessageAuditEvent copy(
            ChatMessageAuditEvent event,
            long roomSequence,
            String membershipId,
            String userId
    ) {
        return new ChatMessageAuditEvent(
                event.auditEventId(), event.schemaVersion(), event.roomId(),
                event.roomChangeSequence(), event.eventType(),
                event.messageId(), roomSequence, event.messageVersion(),
                membershipId, userId, event.actorUserId(),
                ChatMessageAuditActorType.SYSTEM,
                event.occurredAt(), event.before(), event.after());
    }

    private ChatMessageAuditEvent copy(
            ChatMessageAuditEvent event,
            long roomSequence,
            long ignored
    ) {
        return copy(event, roomSequence, event.senderMembershipId(),
                event.senderUserId());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(String json) {
        return JsonMapper.builder().build().readValue(json, Map.class);
    }

    private void assertDescriptors(ZipFile zip, JsonNode descriptors)
            throws Exception {
        Set<String> names = new LinkedHashSet<>();
        for (JsonNode descriptor : descriptors) {
            String name = descriptor.get("name").stringValue();
            names.add(name);
            byte[] bytes;
            try (var input = zip.getInputStream(zip.getEntry(name))) {
                bytes = input.readAllBytes();
            }
            assertThat(descriptor.get("sizeBytes").longValue())
                    .isEqualTo(bytes.length);
            assertThat(descriptor.get("sha256").stringValue())
                    .isEqualTo(sha256(bytes));
        }
        assertThat(names).containsExactly(
                "messages.jsonl", "message_changes.jsonl",
                "transcript.html");
    }

    private static String entry(ZipFile zip, String name)
            throws IOException {
        try (var input = zip.getInputStream(zip.getEntry(name))) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String sha256(Path path) throws Exception {
        try (var input = Files.newInputStream(path)) {
            return sha256(input.readAllBytes());
        }
    }

    private static String sha256(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private record Fixture(
            ResearchChatExportArtifactGenerator generator,
            ResearchChatExportTempWorkspace workspace
    ) {
    }

    private record FixedAuditReader(
            List<ChatMessageAuditEvent> events
    ) implements ChatMessageAuditReader {
        @Override
        public long currentRoomChangeSequence(String roomId) {
            return events.isEmpty()
                    ? 0
                    : events.get(events.size() - 1).roomChangeSequence();
        }

        @Override
        public List<ChatMessageAuditEvent> findChanges(
                String roomId,
                long afterSequenceExclusive,
                long upToSequenceInclusive,
                int limit
        ) {
            return events.stream()
                    .filter(event -> event.roomChangeSequence()
                            > afterSequenceExclusive)
                    .filter(event -> event.roomChangeSequence()
                            <= upToSequenceInclusive)
                    .limit(limit)
                    .toList();
        }
    }
}
