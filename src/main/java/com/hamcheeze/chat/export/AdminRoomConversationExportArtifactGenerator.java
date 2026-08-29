package com.hamcheeze.chat.export;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEventType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditRangeCursor;
import com.hamcheeze.chat.message.audit.ChatMessageAuditRangeReader;
import com.hamcheeze.chat.message.audit.ChatMessageAuditSnapshot;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;

import java.io.BufferedOutputStream;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class AdminRoomConversationExportArtifactGenerator {

    private static final byte[] NEWLINE = {'\n'};
    private static final Set<String> ZIP_ENTRIES = Set.of(
            "manifest.json",
            "messages.jsonl",
            "message_changes.jsonl",
            "transcript.html");
    private static final DateTimeFormatter HTML_TIME =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z")
                    .withZone(ZoneId.of("Asia/Seoul"));

    private final ChatMessageAuditRangeReader auditReader;
    private final ObjectMapper objectMapper;
    private final ChatExportProperties properties;
    private final ChatExportTempManager tempManager;
    private final Clock clock;

    public AdminRoomConversationExportArtifactGenerator(
            ChatMessageAuditRangeReader auditReader,
            ObjectMapper objectMapper,
            ChatExportProperties properties,
            ChatExportTempManager tempManager,
            Clock clock
    ) {
        this.auditReader = Objects.requireNonNull(auditReader, "auditReader");
        this.objectMapper = Objects.requireNonNull(
                objectMapper,
                "objectMapper");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.tempManager = Objects.requireNonNull(
                tempManager,
                "tempManager");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public AdminRoomConversationExportArtifact generate(
            String exportId,
            AdminRoomConversationExportSnapshot snapshot,
            AdminRoomConversationExportTempWorkspace workspace
    ) throws IOException {
        requireNonBlank(exportId, "exportId");
        Objects.requireNonNull(snapshot, "snapshot");
        Objects.requireNonNull(workspace, "workspace");
        ChatExportDeadline deadline = new ChatExportDeadline(
                clock,
                properties.getMaxGenerationDuration());
        ChatExportWorkspaceBudget budget = new ChatExportWorkspaceBudget(
                properties.getMaxWorkDirectoryBytes());
        List<ChatMessageAuditEvent> events = readEvents(snapshot, deadline);
        events.sort(Comparator.comparingLong(
                ChatMessageAuditEvent::roomChangeSequence));
        ReplayResult replay = replay(events);

        writeChanges(workspace.changesFile(), events, budget, deadline);
        writeMessages(
                workspace.messagesFile(),
                replay.messages(),
                budget,
                deadline);
        writeTranscript(
                workspace.transcriptFile(),
                snapshot,
                replay.messages(),
                budget,
                deadline);

        Instant generatedAt = clock.instant();
        List<FileDescriptor> descriptors = List.of(
                descriptor("messages.jsonl", workspace.messagesFile(),
                        deadline),
                descriptor("message_changes.jsonl", workspace.changesFile(),
                        deadline),
                descriptor("transcript.html", workspace.transcriptFile(),
                        deadline));
        Counts counts = counts(events);
        Manifest manifest = new Manifest(
                "admin-room-conversation-export",
                1,
                exportId,
                snapshot.room().roomId(),
                snapshot.room().name(),
                snapshot.room().description(),
                new ManifestRange(
                        snapshot.range().fromInclusive(),
                        snapshot.range().toExclusive()),
                snapshot.capturedChangeSequence(),
                snapshot.capturedAt(),
                generatedAt,
                "INTERNAL_USER_ID",
                "AS_OF_TO_EXCLUSIVE",
                true,
                true,
                "UTC",
                "Asia/Seoul",
                new ManifestCounts(
                        replay.messages().size(),
                        events.size(),
                        counts.created,
                        counts.updated,
                        counts.deleted),
                descriptors);
        writeJson(workspace.manifestFile(), manifest, budget, deadline);
        createZip(workspace, budget, deadline);
        ensureLimits(workspace, deadline);
        long size = Files.size(workspace.artifactZip());
        if (size > properties.getMaxArtifactBytes()) {
            throw tooLarge(
                    "Admin room conversation export artifact size limit "
                            + "exceeded");
        }
        String sha256 = sha256(workspace.artifactZip(), deadline);
        return new AdminRoomConversationExportArtifact(
                workspace,
                workspace.artifactZip(),
                size,
                sha256,
                replay.messages().size(),
                events.size(),
                counts.created,
                counts.updated,
                counts.deleted,
                generatedAt);
    }

    private List<ChatMessageAuditEvent> readEvents(
            AdminRoomConversationExportSnapshot snapshot,
            ChatExportDeadline deadline
    ) {
        List<ChatMessageAuditEvent> events = new ArrayList<>();
        Set<Long> sequences = new HashSet<>();
        AdminRoomConversationExportRange range = snapshot.range();
        ChatMessageAuditRangeCursor cursor =
                ChatMessageAuditRangeCursor.startAt(
                        range.fromInclusive());
        while (true) {
            deadline.check();
            List<ChatMessageAuditEvent> page =
                    auditReader.findChangesInRange(
                            snapshot.room().roomId(),
                            range.fromInclusive(),
                            range.toExclusive(),
                            snapshot.capturedChangeSequence(),
                            cursor,
                            properties.getAuditPageSize());
            if (page.isEmpty()) {
                break;
            }
            if (page.size() > properties.getAuditPageSize()) {
                throw inconsistent("Audit range page exceeded its limit");
            }
            for (ChatMessageAuditEvent event : page) {
                deadline.check();
                validateEvent(snapshot, cursor, event, sequences);
                events.add(event);
                if (events.size() > properties.getMaxEventsPerExport()) {
                    throw tooLarge(
                            "Admin room conversation export event count "
                                    + "limit exceeded");
                }
                cursor = ChatMessageAuditRangeCursor.after(event);
            }
            if (page.size() < properties.getAuditPageSize()) {
                break;
            }
        }
        return events;
    }

    private void validateEvent(
            AdminRoomConversationExportSnapshot snapshot,
            ChatMessageAuditRangeCursor cursor,
            ChatMessageAuditEvent event,
            Set<Long> sequences
    ) {
        AdminRoomConversationExportRange range = snapshot.range();
        boolean afterCursor = event.occurredAt()
                .isAfter(cursor.occurredAt())
                || event.occurredAt().equals(cursor.occurredAt())
                && event.roomChangeSequence()
                > cursor.roomChangeSequence();
        if (!snapshot.room().roomId().equals(event.roomId())
                || event.occurredAt().isBefore(range.fromInclusive())
                || !event.occurredAt().isBefore(range.toExclusive())
                || event.roomChangeSequence() < 1
                || event.roomChangeSequence()
                > snapshot.capturedChangeSequence()
                || !afterCursor
                || !sequences.add(event.roomChangeSequence())) {
            throw inconsistent("Audit range page is inconsistent");
        }
    }

    private ReplayResult replay(List<ChatMessageAuditEvent> events) {
        Map<String, ReplayMessage> replay = new HashMap<>();
        Map<Long, String> roomSequences = new HashMap<>();
        ReplayBudget budget = new ReplayBudget();
        for (ChatMessageAuditEvent event : events) {
            ReplayMessage current = replay.get(event.messageId());
            long priorContentBytes = current == null
                    ? 0
                    : current.contentBytes();
            String priorMessage = roomSequences.putIfAbsent(
                    event.roomSequence(),
                    event.messageId());
            if (priorMessage != null
                    && !priorMessage.equals(event.messageId())) {
                throw inconsistent("Duplicate message sequence identity");
            }
            if (event.eventType()
                    == ChatMessageAuditEventType.MESSAGE_CREATED) {
                if (current != null) {
                    throw inconsistent("Duplicate CREATE identity");
                }
                ensureDistinctMessageCapacity(replay);
                current = ReplayMessage.created(event);
                replay.put(event.messageId(), current);
            } else {
                if (current == null) {
                    ensureDistinctMessageCapacity(replay);
                    try {
                        current = ReplayMessage.beforeRangeChange(event);
                    } catch (IllegalArgumentException exception) {
                        throw inconsistent(
                                "Audit change before snapshot is missing");
                    }
                    replay.put(event.messageId(), current);
                }
                try {
                    current.apply(event);
                } catch (IllegalArgumentException exception) {
                    throw inconsistent("Audit revision replay mismatch");
                }
            }
            updateReplayBudget(budget, priorContentBytes, current);
        }
        List<ReplayMessage> messages = replay.values().stream()
                .filter(ReplayMessage::createdInRange)
                .sorted(Comparator.comparingLong(
                        value -> value.roomSequence))
                .toList();
        return new ReplayResult(messages);
    }

    private void ensureDistinctMessageCapacity(
            Map<String, ReplayMessage> replay
    ) {
        if (replay.size() >= properties.getMaxDistinctMessagesFull()) {
            throw tooLarge("Distinct message limit exceeded");
        }
    }

    private void updateReplayBudget(
            ReplayBudget budget,
            long priorContentBytes,
            ReplayMessage current
    ) {
        try {
            budget.contentBytes = Math.addExact(
                    Math.subtractExact(
                            budget.contentBytes,
                            priorContentBytes),
                    current.contentBytes());
        } catch (ArithmeticException exception) {
            throw tooLarge("Replay content memory limit exceeded");
        }
        if (budget.contentBytes > properties.getMaxReplayContentBytes()) {
            throw tooLarge("Replay content memory limit exceeded");
        }
    }

    private void writeChanges(
            Path file,
            List<ChatMessageAuditEvent> events,
            ChatExportWorkspaceBudget budget,
            ChatExportDeadline deadline
    ) throws IOException {
        try (BufferedOutputStream output = boundedBinaryOutput(
                file,
                properties.getMaxWorkDirectoryBytes(),
                budget,
                deadline)) {
            for (ChatMessageAuditEvent event : events) {
                deadline.check();
                output.write(objectMapper.writeValueAsBytes(change(event)));
                output.write(NEWLINE);
            }
        }
        tempManager.secureFile(file);
    }

    private ChangeRecord change(ChatMessageAuditEvent event) {
        String content = switch (event.eventType()) {
            case MESSAGE_CREATED, MESSAGE_UPDATED -> event.after().content();
            case MESSAGE_DELETED -> event.before() == null
                    ? null
                    : event.before().content();
        };
        if (content == null) {
            throw inconsistent("Audit change content is missing");
        }
        String type = switch (event.eventType()) {
            case MESSAGE_CREATED -> "CREATED";
            case MESSAGE_UPDATED -> "UPDATED";
            case MESSAGE_DELETED -> "DELETED";
        };
        return new ChangeRecord(
                event.roomChangeSequence(),
                event.roomSequence(),
                event.senderUserId(),
                type,
                content,
                event.occurredAt());
    }

    private void writeMessages(
            Path file,
            List<ReplayMessage> messages,
            ChatExportWorkspaceBudget budget,
            ChatExportDeadline deadline
    ) throws IOException {
        try (BufferedOutputStream output = boundedBinaryOutput(
                file,
                properties.getMaxWorkDirectoryBytes(),
                budget,
                deadline)) {
            for (ReplayMessage message : messages) {
                deadline.check();
                MessageRecord record = new MessageRecord(
                        message.roomSequence,
                        message.senderUserId,
                        message.visibleContent(),
                        message.snapshot.createdAt(),
                        message.deleted());
                output.write(objectMapper.writeValueAsBytes(record));
                output.write(NEWLINE);
            }
        }
        tempManager.secureFile(file);
    }

    private void writeTranscript(
            Path file,
            AdminRoomConversationExportSnapshot snapshot,
            List<ReplayMessage> messages,
            ChatExportWorkspaceBudget budget,
            ChatExportDeadline deadline
    ) throws IOException {
        try (BufferedWriter writer = boundedUtf8Writer(
                file,
                properties.getMaxWorkDirectoryBytes(),
                budget,
                deadline)) {
            writer.write("<!doctype html><html><head><meta charset=\"utf-8\">"
                    + "<meta http-equiv=\"Content-Security-Policy\" "
                    + "content=\"default-src 'none'; style-src "
                    + "'unsafe-inline'; img-src 'none'; script-src 'none';\">"
                    + "<style>body{font-family:sans-serif}pre{white-space:"
                    + "pre-wrap;overflow-wrap:anywhere}article{border-top:"
                    + "1px solid #ccc;padding:1rem 0}</style>"
                    + "<title>Admin room conversation transcript</title>"
                    + "</head><body><h1>");
            writer.write(escape(snapshot.room().name()));
            writer.write("</h1><p>");
            writer.write(escape(snapshot.room().description()));
            writer.write("</p><p>조회 기간: ");
            writer.write(escape(HTML_TIME.format(
                    snapshot.range().fromInclusive())));
            writer.write(" 이상, ");
            writer.write(escape(HTML_TIME.format(
                    snapshot.range().toExclusive())));
            writer.write(" 미만</p>\n");
            for (ReplayMessage message : messages) {
                deadline.check();
                writer.write("<article><h3>[");
                writer.write(escape(HTML_TIME.format(
                        message.snapshot.createdAt())));
                writer.write("] ");
                writer.write(escape(message.senderUserId));
                writer.write("</h3><pre>");
                writer.write(escape(message.visibleContent()));
                writer.write("</pre>");
                if (message.editCount > 0 || message.deleted()) {
                    writer.write("<p>");
                    if (message.editCount > 0) {
                        writer.write("수정됨");
                    }
                    if (message.editCount > 0 && message.deleted()) {
                        writer.write(" · ");
                    }
                    if (message.deleted()) {
                        writer.write("삭제됨");
                    }
                    writer.write("</p>");
                }
                writer.write("</article>\n");
            }
            writer.write("</body></html>\n");
        }
        tempManager.secureFile(file);
    }

    private void writeJson(
            Path file,
            Object value,
            ChatExportWorkspaceBudget budget,
            ChatExportDeadline deadline
    ) throws IOException {
        deadline.check();
        try (BufferedOutputStream output = boundedBinaryOutput(
                file,
                properties.getMaxWorkDirectoryBytes(),
                budget,
                deadline)) {
            output.write(objectMapper.writeValueAsBytes(value));
            output.write(NEWLINE);
        }
        deadline.check();
        tempManager.secureFile(file);
    }

    private FileDescriptor descriptor(
            String name,
            Path file,
            ChatExportDeadline deadline
    ) throws IOException {
        validateEntryName(name);
        deadline.check();
        return new FileDescriptor(
                name,
                Files.size(file),
                sha256(file, deadline));
    }

    private void createZip(
            AdminRoomConversationExportTempWorkspace workspace,
            ChatExportWorkspaceBudget budget,
            ChatExportDeadline deadline
    ) throws IOException {
        List<Map.Entry<String, Path>> entries = List.of(
                Map.entry("manifest.json", workspace.manifestFile()),
                Map.entry("messages.jsonl", workspace.messagesFile()),
                Map.entry("message_changes.jsonl", workspace.changesFile()),
                Map.entry("transcript.html", workspace.transcriptFile()));
        try (ZipOutputStream zip = new ZipOutputStream(
                boundedBinaryOutput(
                        workspace.artifactPart(),
                        properties.getMaxArtifactBytes(),
                        budget,
                        deadline),
                StandardCharsets.UTF_8)) {
            for (Map.Entry<String, Path> entry : entries) {
                addZipEntry(zip, entry.getKey(), entry.getValue(), deadline);
            }
        }
        tempManager.secureFile(workspace.artifactPart());
        deadline.check();
        try {
            Files.move(workspace.artifactPart(), workspace.artifactZip(),
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException exception) {
            deadline.check();
            Files.move(workspace.artifactPart(), workspace.artifactZip());
        }
        deadline.check();
        tempManager.secureFile(workspace.artifactZip());
    }

    private void addZipEntry(
            ZipOutputStream zip,
            String name,
            Path file,
            ChatExportDeadline deadline
    ) throws IOException {
        validateEntryName(name);
        deadline.check();
        zip.putNextEntry(new ZipEntry(name));
        byte[] buffer = new byte[16_384];
        try (var input = Files.newInputStream(file)) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                deadline.check();
                zip.write(buffer, 0, read);
            }
        }
        deadline.check();
        zip.closeEntry();
    }

    private void validateEntryName(String name) {
        if (!ZIP_ENTRIES.contains(name)
                || name.contains("/")
                || name.contains("\\")
                || name.contains("..")) {
            throw new IllegalArgumentException("Unsafe ZIP entry name");
        }
    }

    private String sha256(Path file, ChatExportDeadline deadline)
            throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
        try (var input = Files.newInputStream(file)) {
            byte[] buffer = new byte[16_384];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                deadline.check();
                digest.update(buffer, 0, read);
            }
        }
        deadline.check();
        return HexFormat.of().formatHex(digest.digest());
    }

    private void ensureLimits(
            AdminRoomConversationExportTempWorkspace workspace,
            ChatExportDeadline deadline
    ) throws IOException {
        deadline.check();
        if (tempManager.workspaceSize(workspace.directory())
                > properties.getMaxWorkDirectoryBytes()) {
            throw tooLarge(
                    "Admin room conversation export workspace size limit "
                            + "exceeded");
        }
    }

    private BufferedOutputStream boundedBinaryOutput(
            Path path,
            long fileLimit,
            ChatExportWorkspaceBudget budget,
            ChatExportDeadline deadline
    ) throws IOException {
        return new BufferedOutputStream(new ChatExportBoundedOutputStream(
                Files.newOutputStream(path), budget, fileLimit, deadline));
    }

    private BufferedWriter boundedUtf8Writer(
            Path path,
            long fileLimit,
            ChatExportWorkspaceBudget budget,
            ChatExportDeadline deadline
    ) throws IOException {
        return new BufferedWriter(new OutputStreamWriter(
                boundedBinaryOutput(path, fileLimit, budget, deadline),
                StandardCharsets.UTF_8));
    }

    private Counts counts(List<ChatMessageAuditEvent> events) {
        Counts counts = new Counts();
        for (ChatMessageAuditEvent event : events) {
            counts.add(event.eventType());
        }
        return counts;
    }

    private String escape(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private ChatExportException inconsistent(String detail) {
        return new ChatExportException(
                ChatExportErrorCode.CHAT_EXPORT_LEDGER_INCONSISTENT,
                HttpStatus.INTERNAL_SERVER_ERROR,
                false,
                detail);
    }

    private ChatExportException tooLarge(String detail) {
        return new ChatExportException(
                ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE,
                HttpStatus.PAYLOAD_TOO_LARGE,
                false,
                detail);
    }

    private static void requireNonBlank(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
    }

    private record MessageRecord(
            long messageSequence,
            String userId,
            String content,
            Instant createdAt,
            boolean deleted
    ) {
    }

    private record ChangeRecord(
            long changeSequence,
            long messageSequence,
            String userId,
            String changeType,
            String content,
            Instant changedAt
    ) {
    }

    private record FileDescriptor(
            String name,
            long sizeBytes,
            String sha256
    ) {
    }

    private record ManifestRange(
            Instant fromInclusive,
            Instant toExclusive
    ) {
    }

    private record ManifestCounts(
            long messages,
            long changes,
            long created,
            long updated,
            long deleted
    ) {
    }

    private record Manifest(
            String contract,
            int schemaVersion,
            String exportId,
            String roomId,
            String roomName,
            String roomDescription,
            ManifestRange range,
            long capturedChangeSequence,
            Instant capturedAt,
            Instant generatedAt,
            String identityMode,
            String messageRepresentation,
            boolean deletedContentIncluded,
            boolean changeHistoryIncluded,
            String jsonTimezone,
            String htmlTimezone,
            ManifestCounts counts,
            List<FileDescriptor> files
    ) {
    }

    private record ReplayResult(List<ReplayMessage> messages) {
    }

    private static final class Counts {
        long created;
        long updated;
        long deleted;

        void add(ChatMessageAuditEventType type) {
            switch (type) {
                case MESSAGE_CREATED -> created++;
                case MESSAGE_UPDATED -> updated++;
                case MESSAGE_DELETED -> deleted++;
            }
        }
    }

    private static final class ReplayBudget {
        long contentBytes;
    }

    private static final class ReplayMessage {
        final long roomSequence;
        final String senderMembershipId;
        final String senderUserId;
        final boolean createdInRange;
        ChatMessageAuditSnapshot snapshot;
        String lastVisibleContent;
        int editCount;

        private ReplayMessage(
                ChatMessageAuditEvent event,
                ChatMessageAuditSnapshot initial,
                boolean createdInRange
        ) {
            roomSequence = event.roomSequence();
            senderMembershipId = event.senderMembershipId();
            senderUserId = event.senderUserId();
            this.createdInRange = createdInRange;
            snapshot = initial;
            lastVisibleContent = initial.content();
        }

        static ReplayMessage created(ChatMessageAuditEvent event) {
            return new ReplayMessage(event, event.after(), true);
        }

        static ReplayMessage beforeRangeChange(
                ChatMessageAuditEvent event
        ) {
            if (event.before() == null) {
                throw new IllegalArgumentException(
                        "Change before snapshot is required");
            }
            return new ReplayMessage(event, event.before(), false);
        }

        void apply(ChatMessageAuditEvent event) {
            if (!snapshot.equals(event.before())
                    || roomSequence != event.roomSequence()
                    || !senderMembershipId.equals(
                    event.senderMembershipId())
                    || !senderUserId.equals(event.senderUserId())) {
                throw new IllegalArgumentException(
                        "Audit revision replay mismatch");
            }
            if (event.eventType()
                    == ChatMessageAuditEventType.MESSAGE_UPDATED) {
                editCount++;
                lastVisibleContent = event.after().content();
            } else if (event.eventType()
                    == ChatMessageAuditEventType.MESSAGE_DELETED) {
                lastVisibleContent = event.before().content();
            } else {
                throw new IllegalArgumentException(
                        "Unexpected replay CREATE");
            }
            snapshot = event.after();
        }

        boolean createdInRange() {
            return createdInRange;
        }

        boolean deleted() {
            return snapshot.state() == MessageState.DELETED_BY_AUTHOR;
        }

        String visibleContent() {
            return deleted() ? lastVisibleContent : snapshot.content();
        }

        long contentBytes() {
            String content = visibleContent();
            return content == null
                    ? 0
                    : content.getBytes(StandardCharsets.UTF_8).length;
        }
    }
}
