package com.hamcheeze.chat.export;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditRangeCursor;
import com.hamcheeze.chat.message.audit.ChatMessageAuditRangeReader;
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
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminRoomConversationExportArtifactGeneratorTest {

    private static final Instant FROM =
            Instant.parse("2026-08-24T02:00:00Z");
    private static final Instant TO =
            Instant.parse("2026-08-24T03:00:00Z");
    private static final Instant CAPTURED_AT =
            Instant.parse("2026-08-24T03:00:01Z");
    private static final String EXPORT_ID =
            "21000000-0000-0000-0000-000000000001";

    @TempDir
    Path tempDirectory;

    @Test
    void exportsRangeCohortFinalStateAndEveryRangeChange()
            throws Exception {
        List<ChatMessageAuditEvent> events = events();
        Fixture fixture = fixture(
                new FixedRangeReader(events),
                ignored -> { });

        AdminRoomConversationExportArtifact artifact =
                fixture.generator().generate(
                        EXPORT_ID,
                        snapshot(5),
                        fixture.workspace());

        assertThat(artifact.messageCount()).isEqualTo(2);
        assertThat(artifact.changeCount()).isEqualTo(5);
        assertThat(artifact.createdCount()).isEqualTo(2);
        assertThat(artifact.updatedCount()).isEqualTo(2);
        assertThat(artifact.deletedCount()).isEqualTo(1);
        assertThat(artifact.sha256()).isEqualTo(
                sha256(artifact.path()));
        assertThat(Files.size(artifact.path()))
                .isEqualTo(artifact.sizeBytes());

        try (ZipFile zip = new ZipFile(artifact.path().toFile())) {
            assertThat(zip.stream().map(ZipEntry::getName).toList())
                    .containsExactly(
                            "manifest.json",
                            "messages.jsonl",
                            "message_changes.jsonl",
                            "transcript.html");

            List<JsonNode> messages = jsonLines(
                    entry(zip, "messages.jsonl"));
            assertThat(messages).hasSize(2);
            assertThat(messages)
                    .extracting(value ->
                            value.get("messageSequence").longValue())
                    .containsExactly(2L, 3L);
            assertThat(messages)
                    .extracting(value -> value.get("userId").stringValue())
                    .containsExactly("user-1", "user-2");
            assertThat(messages.get(0).get("content").stringValue())
                    .isEqualTo("기간 안에서 수정됨");
            assertThat(messages.get(0).get("deleted").booleanValue())
                    .isFalse();
            assertThat(messages.get(1).get("deleted").booleanValue())
                    .isTrue();
            assertThat(messages)
                    .allSatisfy(value -> assertThat(value.propertyNames())
                            .containsExactlyInAnyOrder(
                                    "messageSequence",
                                    "userId",
                                    "content",
                                    "createdAt",
                                    "deleted"));

            List<JsonNode> changes = jsonLines(
                    entry(zip, "message_changes.jsonl"));
            assertThat(changes).hasSize(5);
            assertThat(changes)
                    .extracting(value ->
                            value.get("changeSequence").longValue())
                    .containsExactly(1L, 2L, 3L, 4L, 5L);
            assertThat(changes.getFirst().get("userId").stringValue())
                    .isEqualTo("user-before-range");
            assertThat(changes)
                    .allSatisfy(value -> assertThat(value.propertyNames())
                            .containsExactlyInAnyOrder(
                                    "changeSequence",
                                    "messageSequence",
                                    "userId",
                                    "changeType",
                                    "content",
                                    "changedAt"));

            String transcript = entry(zip, "transcript.html");
            assertThat(transcript)
                    .contains("Admin room conversation transcript")
                    .contains("조회 기간:")
                    .contains("기간 안에서 수정됨")
                    .contains("삭제됨")
                    .doesNotContain("user-before-range")
                    .contains("default-src 'none'")
                    .contains("script-src 'none'");

            JsonNode manifest = JsonMapper.builder().build()
                    .readTree(entry(zip, "manifest.json"));
            assertThat(manifest.propertyNames())
                    .containsExactlyInAnyOrder(
                            "contract",
                            "schemaVersion",
                            "exportId",
                            "roomId",
                            "roomName",
                            "roomDescription",
                            "range",
                            "capturedChangeSequence",
                            "capturedAt",
                            "generatedAt",
                            "identityMode",
                            "messageRepresentation",
                            "deletedContentIncluded",
                            "changeHistoryIncluded",
                            "jsonTimezone",
                            "htmlTimezone",
                            "counts",
                            "files");
            assertThat(manifest.get("contract").stringValue())
                    .isEqualTo("admin-room-conversation-export");
            assertThat(manifest.get("schemaVersion").intValue())
                    .isEqualTo(1);
            assertThat(manifest.get("range").get("fromInclusive")
                    .stringValue()).isEqualTo(FROM.toString());
            assertThat(manifest.get("range").get("toExclusive")
                    .stringValue()).isEqualTo(TO.toString());
            assertThat(manifest.get("messageRepresentation").stringValue())
                    .isEqualTo("AS_OF_TO_EXCLUSIVE");
            assertThat(manifest.get("capturedChangeSequence").longValue())
                    .isEqualTo(5L);
            assertThat(manifest.has("roomCategoryIds")).isFalse();
            assertThat(manifest.has("roomCategories")).isFalse();
            assertDescriptors(zip, manifest.get("files"));
        }
    }

    @Test
    void emptyRangeProducesValidEmptyArtifact() throws Exception {
        Fixture fixture = fixture(
                new FixedRangeReader(List.of()),
                ignored -> { });

        AdminRoomConversationExportArtifact artifact =
                fixture.generator().generate(
                        EXPORT_ID,
                        snapshot(0),
                        fixture.workspace());

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
        }
    }

    @Test
    void rejectsEventLimitAndNonAdvancingRangePage() throws Exception {
        Fixture limited = fixture(
                new FixedRangeReader(events()),
                properties -> {
                    properties.setAuditPageSize(1);
                    properties.setMaxEventsPerExport(1);
                });
        assertThatThrownBy(() -> limited.generator().generate(
                EXPORT_ID,
                snapshot(5),
                limited.workspace()))
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> assertThat(
                        ((ChatExportException) error).code())
                        .isEqualTo(ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE));

        ChatMessageAuditEvent repeated = events().getFirst();
        Fixture nonAdvancing = fixture(
                new RepeatingRangeReader(repeated),
                properties -> properties.setAuditPageSize(1));
        assertThatThrownBy(() -> nonAdvancing.generator().generate(
                EXPORT_ID,
                snapshot(5),
                nonAdvancing.workspace()))
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> assertThat(
                        ((ChatExportException) error).code())
                        .isEqualTo(ChatExportErrorCode
                                .CHAT_EXPORT_LEDGER_INCONSISTENT));
    }

    private Fixture fixture(
            ChatMessageAuditRangeReader reader,
            Consumer<ChatExportProperties> customize
    ) throws IOException {
        ChatExportProperties properties = new ChatExportProperties();
        properties.setTempRoot(tempDirectory.resolve(
                "workspace-" + System.nanoTime()));
        properties.setMinFreeDiskBytes(0);
        properties.setOrphanTtl(Duration.ofHours(1));
        customize.accept(properties);
        Clock clock = Clock.fixed(CAPTURED_AT, ZoneOffset.UTC);
        ChatExportTempManager tempManager = new ChatExportTempManager(
                properties,
                clock,
                new SimpleMeterRegistry());
        tempManager.initialize();
        ResearchChatExportTempWorkspace workspace =
                tempManager.createResearch(EXPORT_ID);
        return new Fixture(
                new AdminRoomConversationExportArtifactGenerator(
                        reader,
                        JsonMapper.builder().build(),
                        properties,
                        tempManager,
                        clock),
                workspace);
    }

    private AdminRoomConversationExportSnapshot snapshot(long watermark) {
        ChatExportRoomSnapshot room = new ChatExportRoomSnapshot(
                "room-1",
                "지역 교통 정책 토론방",
                "지역 교통 정책 개선안을 논의하는 채팅방입니다.",
                List.of("category-1"),
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                "membership-owner",
                3,
                FROM.minusSeconds(86_400),
                null,
                CAPTURED_AT);
        return new AdminRoomConversationExportSnapshot(
                room,
                new AdminRoomConversationExportRange(FROM, TO),
                watermark,
                CAPTURED_AT);
    }

    private List<ChatMessageAuditEvent> events() {
        ChatMessage beforeRange = message(
                "message-before",
                1,
                "user-before-range",
                "membership-before-range",
                "기간 이전 메시지",
                MessageState.ACTIVE,
                1,
                FROM.minusSeconds(60),
                FROM.minusSeconds(60),
                null);
        ChatMessage beforeRangeUpdated = message(
                "message-before",
                1,
                "user-before-range",
                "membership-before-range",
                "기간 안에서 수정된 이전 메시지",
                MessageState.ACTIVE,
                2,
                FROM.minusSeconds(60),
                FROM.plusSeconds(5),
                null);
        ChatMessage first = message(
                "message-1",
                2,
                "user-1",
                "membership-1",
                "기간 안에서 생성됨",
                MessageState.ACTIVE,
                1,
                FROM.plusSeconds(10),
                FROM.plusSeconds(10),
                null);
        ChatMessage second = message(
                "message-2",
                3,
                "user-2",
                "membership-2",
                "삭제 예정",
                MessageState.ACTIVE,
                1,
                FROM.plusSeconds(20),
                FROM.plusSeconds(20),
                null);
        ChatMessage firstUpdated = message(
                "message-1",
                2,
                "user-1",
                "membership-1",
                "기간 안에서 수정됨",
                MessageState.ACTIVE,
                2,
                FROM.plusSeconds(10),
                FROM.plusSeconds(30),
                null);
        ChatMessage secondDeleted = message(
                "message-2",
                3,
                "user-2",
                "membership-2",
                null,
                MessageState.DELETED_BY_AUTHOR,
                2,
                FROM.plusSeconds(20),
                FROM.plusSeconds(40),
                FROM.plusSeconds(40));

        return List.of(
                ChatMessageAuditEvent.updated(
                        beforeRange,
                        beforeRangeUpdated,
                        1,
                        "user-before-range",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT),
                ChatMessageAuditEvent.created(
                        first,
                        2,
                        "user-1",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT),
                ChatMessageAuditEvent.created(
                        second,
                        3,
                        "user-2",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT),
                ChatMessageAuditEvent.updated(
                        first,
                        firstUpdated,
                        4,
                        "user-1",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT),
                ChatMessageAuditEvent.deleted(
                        second,
                        secondDeleted,
                        5,
                        "user-2",
                        ChatMessageAuditActorType.ROOM_PARTICIPANT));
    }

    private ChatMessage message(
            String messageId,
            long roomSequence,
            String userId,
            String membershipId,
            String content,
            MessageState state,
            long version,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt
    ) {
        return new ChatMessage(
                messageId,
                "room-1",
                roomSequence,
                userId,
                membershipId,
                "client-" + messageId,
                content,
                state,
                true,
                version,
                createdAt,
                updatedAt,
                deletedAt);
    }

    private List<JsonNode> jsonLines(String value) throws IOException {
        List<JsonNode> result = new ArrayList<>();
        for (String line : value.lines().toList()) {
            result.add(JsonMapper.builder().build().readTree(line));
        }
        return result;
    }

    private String entry(ZipFile zip, String name) throws IOException {
        try (var input = zip.getInputStream(zip.getEntry(name))) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
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
                    .isEqualTo(HexFormat.of().formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(bytes)));
        }
        assertThat(names).containsExactly(
                "messages.jsonl",
                "message_changes.jsonl",
                "transcript.html");
    }

    private String sha256(Path path) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256")
                        .digest(Files.readAllBytes(path)));
    }

    private record Fixture(
            AdminRoomConversationExportArtifactGenerator generator,
            ResearchChatExportTempWorkspace workspace
    ) {
    }

    private static final class FixedRangeReader
            implements ChatMessageAuditRangeReader {
        private final List<ChatMessageAuditEvent> events;

        private FixedRangeReader(List<ChatMessageAuditEvent> events) {
            this.events = events.stream()
                    .sorted(Comparator
                            .comparing(ChatMessageAuditEvent::occurredAt)
                            .thenComparingLong(ChatMessageAuditEvent
                                    ::roomChangeSequence))
                    .toList();
        }

        @Override
        public List<ChatMessageAuditEvent> findChangesInRange(
                String roomId,
                Instant fromInclusive,
                Instant toExclusive,
                long upToSequenceInclusive,
                ChatMessageAuditRangeCursor afterExclusive,
                int limit
        ) {
            return events.stream()
                    .filter(event -> event.roomId().equals(roomId))
                    .filter(event -> !event.occurredAt()
                            .isBefore(fromInclusive))
                    .filter(event -> event.occurredAt()
                            .isBefore(toExclusive))
                    .filter(event -> event.roomChangeSequence()
                            <= upToSequenceInclusive)
                    .filter(event -> event.occurredAt()
                            .isAfter(afterExclusive.occurredAt())
                            || event.occurredAt().equals(
                            afterExclusive.occurredAt())
                            && event.roomChangeSequence()
                            > afterExclusive.roomChangeSequence())
                    .limit(limit)
                    .toList();
        }
    }

    private record RepeatingRangeReader(ChatMessageAuditEvent event)
            implements ChatMessageAuditRangeReader {

        @Override
        public List<ChatMessageAuditEvent> findChangesInRange(
                String roomId,
                Instant fromInclusive,
                Instant toExclusive,
                long upToSequenceInclusive,
                ChatMessageAuditRangeCursor afterExclusive,
                int limit
        ) {
            return List.of(event);
        }
    }
}
