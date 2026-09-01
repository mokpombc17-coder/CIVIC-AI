package com.hamcheeze.chat.export;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEventType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import com.hamcheeze.chat.message.audit.ChatMessageAuditSnapshot;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
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

public final class ResearchChatExportArtifactGenerator {

    private static final byte[] NEWLINE = {'\n'};
    private static final Set<String> ZIP_ENTRIES = Set.of(
            "metadata.json",
            "messages.jsonl",
            "message_changes.jsonl",
            "transcript.html");
    private static final DateTimeFormatter HTML_TIME =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z")
                    .withZone(ZoneId.of("Asia/Seoul"));

    private final ChatMessageAuditReader auditReader;
    private final ObjectMapper objectMapper;
    private final ChatExportProperties properties;
    private final ChatExportTempManager tempManager;
    private final Clock clock;

    public ResearchChatExportArtifactGenerator(
            ChatMessageAuditReader auditReader,
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

    public ResearchChatExportArtifact generate(
            ResearchChatExportJob job,
            ResearchChatExportSnapshot snapshot,
            ResearchChatExportTempWorkspace workspace
    ) throws IOException {
        ChatExportDeadline deadline = new ChatExportDeadline(
                clock,
                properties.getMaxGenerationDuration());
        ChatExportWorkspaceBudget budget = new ChatExportWorkspaceBudget(
                properties.getMaxWorkDirectoryBytes());
        Map<String, ReplayMessage> replay = new HashMap<>();
        Map<Long, String> roomSequences = new HashMap<>();
        ReplayBudget replayBudget = new ReplayBudget();
        Counts counts = new Counts();

        try (BufferedOutputStream changes = boundedBinaryOutput(
                workspace.changesFile(),
                properties.getMaxWorkDirectoryBytes(),
                budget,
                deadline)) {
            scanLedger(job, replay, roomSequences, replayBudget,
                    counts, changes, deadline);
        }
        tempManager.secureFile(workspace.changesFile());

        List<ReplayMessage> messages = replay.values().stream()
                .sorted(Comparator.comparingLong(value -> value.roomSequence))
                .toList();
        writeMessages(workspace.messagesFile(), messages, budget, deadline);
        writeTranscript(workspace.transcriptFile(), snapshot.room(), messages,
                budget, deadline);
        writeJson(
                workspace.metadataFile(),
                metadata(snapshot, messages),
                budget,
                deadline);

        Instant generatedAt = clock.instant();
        createZip(workspace, budget, deadline);
        ensureLimits(workspace, deadline);
        long size = Files.size(workspace.artifactZip());
        if (size > properties.getMaxArtifactBytes()) {
            throw tooLarge("Research export artifact size limit exceeded");
        }
        String sha256 = sha256(workspace.artifactZip(), deadline);
        return new ResearchChatExportArtifact(
                workspace,
                workspace.artifactZip(),
                size,
                sha256,
                messages.size(),
                counts.changes,
                counts.created,
                counts.updated,
                counts.deleted,
                generatedAt);
    }

    private void scanLedger(
            ResearchChatExportJob job,
            Map<String, ReplayMessage> replay,
            Map<Long, String> roomSequences,
            ReplayBudget replayBudget,
            Counts counts,
            BufferedOutputStream changes,
            ChatExportDeadline deadline
    ) throws IOException {
        long expected = 1;
        long after = 0;
        while (after < job.capturedChangeSequence()) {
            deadline.check();
            List<ChatMessageAuditEvent> page = auditReader.findChanges(
                    job.roomId(),
                    after,
                    job.capturedChangeSequence(),
                    properties.getAuditPageSize());
            if (page.isEmpty()) {
                throw inconsistent("Audit ledger sequence gap");
            }
            for (ChatMessageAuditEvent event : page) {
                deadline.check();
                if (!job.roomId().equals(event.roomId())
                        || event.roomChangeSequence() != expected
                        || event.roomChangeSequence()
                        > job.capturedChangeSequence()) {
                    throw inconsistent("Audit ledger sequence mismatch");
                }
                replay(event, replay, roomSequences, replayBudget);
                ChangeRecord change = change(event);
                changes.write(objectMapper.writeValueAsBytes(change));
                changes.write(NEWLINE);
                counts.add(event.eventType());
                if (counts.changes > properties.getMaxEventsPerExport()) {
                    throw tooLarge("Research export event count limit exceeded");
                }
                after = event.roomChangeSequence();
                expected++;
            }
        }
        if (expected != job.capturedChangeSequence() + 1) {
            throw inconsistent("Audit ledger ended before watermark");
        }
    }

    private void replay(
            ChatMessageAuditEvent event,
            Map<String, ReplayMessage> replay,
            Map<Long, String> roomSequences,
            ReplayBudget budget
    ) {
        ReplayMessage current = replay.get(event.messageId());
        long priorContentBytes = current == null ? 0 : current.contentBytes();
        if (event.eventType() == ChatMessageAuditEventType.MESSAGE_CREATED) {
            if (current != null
                    || roomSequences.putIfAbsent(
                    event.roomSequence(), event.messageId()) != null) {
                throw inconsistent("Duplicate CREATE identity");
            }
            if (replay.size() >= properties.getMaxDistinctMessagesFull()) {
                throw tooLarge("Distinct message limit exceeded");
            }
            replay.put(event.messageId(), ReplayMessage.created(event));
        } else {
            if (current == null
                    || !current.snapshot.equals(event.before())
                    || current.roomSequence != event.roomSequence()
                    || !current.senderMembershipId.equals(
                    event.senderMembershipId())
                    || !current.senderUserId.equals(event.senderUserId())) {
                throw inconsistent("Audit revision replay mismatch");
            }
            current.apply(event);
        }
        long currentContentBytes = replay.get(event.messageId())
                .contentBytes();
        try {
            budget.contentBytes = Math.addExact(
                    Math.subtractExact(
                            budget.contentBytes,
                            priorContentBytes),
                    currentContentBytes);
        } catch (ArithmeticException exception) {
            throw tooLarge("Replay content memory limit exceeded");
        }
        if (budget.contentBytes > properties.getMaxReplayContentBytes()) {
            throw tooLarge("Replay content memory limit exceeded");
        }
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

    private Metadata metadata(
            ResearchChatExportSnapshot snapshot,
            List<ReplayMessage> messages
    ) {
        Map<String, Long> messageCounts = new HashMap<>();
        for (ReplayMessage message : messages) {
            messageCounts.merge(message.senderUserId, 1L, Long::sum);
        }

        Set<String> participantUserIds = new HashSet<>();
        List<MetadataParticipant> participants = snapshot.participants()
                .stream()
                .map(participant -> {
                    if (!participantUserIds.add(participant.userId())) {
                        throw inconsistent(
                                "Duplicate participant user identity");
                    }
                    long messageCount = messageCounts.getOrDefault(
                            participant.userId(),
                            0L);
                    messageCounts.remove(participant.userId());
                    return new MetadataParticipant(
                            participant.userId(),
                            participant.status(),
                            messageCount);
                })
                .toList();
        if (!messageCounts.isEmpty()) {
            throw inconsistent(
                    "Message author membership snapshot is missing");
        }

        List<MetadataCategory> categories = snapshot.categories().stream()
                .map(category -> new MetadataCategory(
                        category.categoryId(),
                        category.name()))
                .toList();
        ChatExportRoomSnapshot room = snapshot.room();
        return new Metadata(
                1,
                snapshot.capturedAt(),
                new MetadataRoom(
                        room.roomId(),
                        room.name(),
                        room.description(),
                        categories,
                        room.status(),
                        room.createdAt(),
                        room.closedAt()),
                participants);
    }

    private void writeTranscript(
            Path file,
            ChatExportRoomSnapshot room,
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
                    + "<title>Research Room transcript</title></head><body><h1>");
            writer.write(escape(room.name()));
            writer.write("</h1><p>");
            writer.write(escape(room.description()));
            writer.write("</p>\n");
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

    private void createZip(
            ResearchChatExportTempWorkspace workspace,
            ChatExportWorkspaceBudget budget,
            ChatExportDeadline deadline
    ) throws IOException {
        List<Map.Entry<String, Path>> entries = List.of(
                Map.entry("metadata.json", workspace.metadataFile()),
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
            ResearchChatExportTempWorkspace workspace,
            ChatExportDeadline deadline
    ) throws IOException {
        deadline.check();
        if (tempManager.workspaceSize(workspace.directory())
                > properties.getMaxWorkDirectoryBytes()) {
            throw tooLarge("Research export workspace size limit exceeded");
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

    private record MetadataCategory(
            String categoryId,
            String name
    ) {
    }

    private record MetadataRoom(
            String roomId,
            String name,
            String description,
            List<MetadataCategory> categories,
            RoomStatus status,
            Instant createdAt,
            Instant closedAt
    ) {
    }

    private record MetadataParticipant(
            String userId,
            MembershipStatus status,
            long messageCount
    ) {
    }

    private record Metadata(
            int schemaVersion,
            Instant capturedAt,
            MetadataRoom room,
            List<MetadataParticipant> participants
    ) {
    }

    private static final class Counts {
        long changes;
        long created;
        long updated;
        long deleted;

        void add(ChatMessageAuditEventType type) {
            changes++;
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
        ChatMessageAuditSnapshot snapshot;
        String lastVisibleContent;
        int editCount;

        private ReplayMessage(ChatMessageAuditEvent event) {
            roomSequence = event.roomSequence();
            senderMembershipId = event.senderMembershipId();
            senderUserId = event.senderUserId();
            snapshot = event.after();
            lastVisibleContent = snapshot.content();
        }

        static ReplayMessage created(ChatMessageAuditEvent event) {
            return new ReplayMessage(event);
        }

        void apply(ChatMessageAuditEvent event) {
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
