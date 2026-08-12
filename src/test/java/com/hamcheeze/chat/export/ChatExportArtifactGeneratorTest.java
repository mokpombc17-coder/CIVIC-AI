package com.hamcheeze.chat.export;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomCategory;
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
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatExportArtifactGeneratorTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-11T01:00:00Z");

    @TempDir
    Path tempDirectory;

    @Test
    void fullReplaysEveryRevisionAndPreservesDeletedContent()
            throws Exception {
        List<ChatMessageAuditEvent> events = revisions();
        Fixture fixture = fixture(events);
        ChatExportJob job = ChatExportJob.running(
                "11111111-1111-1111-1111-111111111111",
                "room-1",
                ChatExportMode.FULL,
                null,
                0,
                4,
                "admin-1",
                CREATED_AT);
        ChatExportArtifact artifact = fixture.generator().generate(
                job,
                snapshot(),
                fixture.workspace());

        assertThat(artifact.eventCount()).isEqualTo(4);
        assertThat(artifact.sha256()).isEqualTo(sha256(artifact.path()));
        assertThat(Files.size(artifact.path())).isEqualTo(
                artifact.sizeBytes());

        try (ZipFile zip = new ZipFile(artifact.path().toFile())) {
            assertThat(zip.stream().map(ZipEntry::getName).toList())
                    .containsExactlyInAnyOrder(
                            "manifest.json",
                            "room.json",
                            "participants.jsonl",
                            "events.jsonl",
                            "transcript.html");
            String transcript = entry(zip, "transcript.html");
            assertThat(transcript)
                    .contains("삭제 직전 &lt;본문&gt;")
                    .contains("2회 수정됨")
                    .doesNotContain("<script>");
            assertThat(entry(zip, "events.jsonl").lines())
                    .hasSize(4);
            JsonNode manifest = JsonMapper.builder().build()
                    .readTree(entry(zip, "manifest.json"));
            assertThat(manifest.get("fromChangeSequenceExclusive")
                    .longValue()).isZero();
            assertThat(manifest.get("toChangeSequenceInclusive")
                    .longValue()).isEqualTo(4);
        }
    }

    @Test
    void incrementalWithNoChangesProducesValidEmptyBundle()
            throws Exception {
        Fixture fixture = fixture(List.of());
        ChatExportJob job = ChatExportJob.running(
                "22222222-2222-2222-2222-222222222222",
                "room-1",
                ChatExportMode.INCREMENTAL,
                "base-export",
                3,
                3,
                "admin-1",
                CREATED_AT);

        ChatExportArtifact artifact = fixture.generator().generate(
                job,
                snapshot(),
                fixture.workspace());

        try (ZipFile zip = new ZipFile(artifact.path().toFile())) {
            assertThat(entry(zip, "events.jsonl")).isEmpty();
            assertThat(entry(zip, "changes.html"))
                    .contains("변경 사항이 없습니다");
        }
    }

    @Test
    void sequenceGapFailsClosed() throws Exception {
        List<ChatMessageAuditEvent> events = revisions();
        Fixture fixture = fixture(List.of(events.get(0), events.get(2)));
        ChatExportJob job = ChatExportJob.running(
                "33333333-3333-3333-3333-333333333333",
                "room-1",
                ChatExportMode.FULL,
                null,
                0,
                4,
                "admin-1",
                CREATED_AT);

        assertThatThrownBy(() -> fixture.generator().generate(
                job,
                snapshot(),
                fixture.workspace()))
                .isInstanceOf(ChatExportException.class)
                .satisfies(exception -> assertThat(
                        ((ChatExportException) exception).code())
                        .isEqualTo(ChatExportErrorCode
                                .CHAT_EXPORT_LEDGER_INCONSISTENT));
    }

    private Fixture fixture(List<ChatMessageAuditEvent> events)
            throws IOException {
        ChatExportProperties properties = new ChatExportProperties();
        properties.setTempRoot(tempDirectory);
        properties.setMinFreeDiskBytes(0);
        properties.setOrphanTtl(Duration.ofHours(1));
        Clock clock = Clock.fixed(
                Instant.parse("2026-08-11T02:00:00Z"),
                ZoneOffset.UTC);
        ChatExportTempManager tempManager = new ChatExportTempManager(
                properties,
                clock,
                new SimpleMeterRegistry());
        tempManager.initialize();
        String exportId = events.isEmpty()
                ? "22222222-2222-2222-2222-222222222222"
                : events.size() == 2
                        ? "33333333-3333-3333-3333-333333333333"
                        : "11111111-1111-1111-1111-111111111111";
        ChatExportTempWorkspace workspace = tempManager.create(
                exportId,
                events.isEmpty()
                        ? ChatExportMode.INCREMENTAL
                        : ChatExportMode.FULL);
        return new Fixture(
                new ChatExportArtifactGenerator(
                        new FixedAuditReader(events),
                        JsonMapper.builder().build(),
                        properties,
                        tempManager,
                        clock),
                workspace);
    }

    private ChatExportSnapshot snapshot() {
        ChatExportRoomSnapshot room = new ChatExportRoomSnapshot(
                "room-1",
                "감사 <Room>",
                "설명",
                List.of(RoomCategory.POLICY),
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                "membership-1",
                1,
                CREATED_AT,
                null,
                CREATED_AT);
        ChatExportParticipantSnapshot participant =
                new ChatExportParticipantSnapshot(
                        1,
                        "membership-1",
                        "user-1",
                        1L,
                        "참여자 <script>",
                        MembershipRole.OWNER,
                        MembershipStatus.ACTIVE,
                        CREATED_AT,
                        null,
                        null,
                        1L,
                        1L,
                        true,
                        CREATED_AT);
        return new ChatExportSnapshot(room, List.of(participant));
    }

    private List<ChatMessageAuditEvent> revisions() {
        ChatMessage created = message(
                "최초 본문",
                MessageState.ACTIVE,
                1,
                CREATED_AT,
                null);
        ChatMessage updated = message(
                "수정 본문",
                MessageState.ACTIVE,
                2,
                CREATED_AT.plusSeconds(60),
                null);
        ChatMessage finalUpdate = message(
                "삭제 직전 <본문>",
                MessageState.ACTIVE,
                3,
                CREATED_AT.plusSeconds(120),
                null);
        ChatMessage deleted = message(
                null,
                MessageState.DELETED_BY_AUTHOR,
                4,
                CREATED_AT.plusSeconds(180),
                CREATED_AT.plusSeconds(180));
        List<ChatMessageAuditEvent> events = new ArrayList<>();
        events.add(ChatMessageAuditEvent.created(
                created,
                1,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT));
        events.add(ChatMessageAuditEvent.updated(
                created,
                updated,
                2,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT));
        events.add(ChatMessageAuditEvent.deleted(
                finalUpdate,
                deleted,
                4,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT));
        events.add(2, ChatMessageAuditEvent.updated(
                updated,
                finalUpdate,
                3,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT));
        return events;
    }

    private ChatMessage message(
            String content,
            MessageState state,
            long version,
            Instant updatedAt,
            Instant deletedAt
    ) {
        return new ChatMessage(
                "message-1",
                "room-1",
                1,
                "user-1",
                "membership-1",
                "client-1",
                content,
                state,
                true,
                version,
                CREATED_AT,
                updatedAt,
                deletedAt);
    }

    private static String entry(ZipFile zip, String name)
            throws IOException {
        try (var input = zip.getInputStream(zip.getEntry(name))) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String sha256(Path path) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (var input = Files.newInputStream(path)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private record Fixture(
            ChatExportArtifactGenerator generator,
            ChatExportTempWorkspace workspace
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
