package com.hamcheeze.chat.export;

import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEventType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import com.hamcheeze.chat.message.audit.ChatMessageAuditSnapshot;
import com.hamcheeze.chat.message.MessageState;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class ChatExportArtifactGenerator {

    private static final byte[] NEWLINE = {'\n'};
    private static final DateTimeFormatter HTML_TIME =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z")
                    .withZone(ZoneId.of("Asia/Seoul"));

    private final ChatMessageAuditReader auditReader;
    private final ObjectMapper objectMapper;
    private final ChatExportProperties properties;
    private final ChatExportTempManager tempManager;
    private final Clock clock;

    public ChatExportArtifactGenerator(
            ChatMessageAuditReader auditReader,
            ObjectMapper objectMapper,
            ChatExportProperties properties,
            ChatExportTempManager tempManager,
            Clock clock
    ) {
        this.auditReader = Objects.requireNonNull(
                auditReader,
                "auditReader");
        this.objectMapper = Objects.requireNonNull(
                objectMapper,
                "objectMapper");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.tempManager = Objects.requireNonNull(
                tempManager,
                "tempManager");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public ChatExportArtifact generate(
            ChatExportJob job,
            ChatExportSnapshot snapshot,
            ChatExportTempWorkspace workspace
    ) throws IOException {
        ChatExportDeadline deadline = new ChatExportDeadline(
                clock,
                properties.getMaxGenerationDuration());
        ChatExportWorkspaceBudget workspaceBudget =
                new ChatExportWorkspaceBudget(
                        properties.getMaxWorkDirectoryBytes());
        writeJson(
                workspace.roomFile(),
                snapshot.room(),
                workspaceBudget,
                deadline);

        Map<String, ChatExportParticipantSnapshot> participants =
                participantMap(snapshot.participants());
        Map<String, String> auditIdentities = new HashMap<>();
        Map<String, ReplayMessage> replay = new HashMap<>();
        Map<Long, String> roomSequences = new HashMap<>();
        ReplayBudget replayBudget = new ReplayBudget();
        Counts counts = new Counts();

        try (BufferedOutputStream events = boundedBinaryOutput(
                workspace.eventsFile(),
                properties.getMaxWorkDirectoryBytes(),
                workspaceBudget,
                deadline);
             BufferedWriter changes = job.mode() == ChatExportMode.INCREMENTAL
                     ? boundedUtf8Writer(
                             workspace.htmlFile(),
                             properties.getMaxWorkDirectoryBytes(),
                             workspaceBudget,
                             deadline)
                     : null) {
            if (changes != null) {
                writeHtmlHeader(
                        changes,
                        "Incremental Room message changes",
                        snapshot.room());
            }
            scanLedger(
                    job,
                    participants,
                    auditIdentities,
                    replay,
                    roomSequences,
                    replayBudget,
                    counts,
                    events,
                    changes,
                    deadline);
            if (changes != null) {
                if (counts.events == 0) {
                    deadline.check();
                    changes.write("<p>마지막 성공 Export 이후 "
                            + "변경 사항이 없습니다.</p>\n");
                }
                writeHtmlFooter(changes);
            }
        }
        tempManager.secureFile(workspace.eventsFile());
        if (job.mode() == ChatExportMode.INCREMENTAL) {
            tempManager.secureFile(workspace.htmlFile());
        }

        addSyntheticParticipants(
                participants,
                auditIdentities,
                snapshot.room().capturedAt());
        List<ChatExportParticipantSnapshot> participantList =
                sortedParticipants(participants);
        writeJsonLines(
                workspace.participantsFile(),
                participantList,
                workspaceBudget,
                deadline);

        if (job.mode() == ChatExportMode.FULL) {
            writeTranscript(
                    workspace.htmlFile(),
                    snapshot.room(),
                    participants,
                    replay,
                    workspaceBudget,
                    deadline);
        }

        deadline.check();
        Instant generatedAt = clock.instant();
        List<FileDescriptor> descriptors = List.of(
                descriptor("room.json", workspace.roomFile(), deadline),
                descriptor(
                        "participants.jsonl",
                        workspace.participantsFile(),
                        deadline),
                descriptor(
                        "events.jsonl",
                        workspace.eventsFile(),
                        deadline),
                descriptor(
                        workspace.htmlFile().getFileName().toString(),
                        workspace.htmlFile(),
                        deadline));
        Manifest manifest = new Manifest(
                1,
                job.exportId(),
                job.roomId(),
                job.mode(),
                job.baseExportId(),
                job.fromChangeSequenceExclusive(),
                job.toChangeSequenceInclusive(),
                "IDENTIFIED_AUDIT",
                "AUDIT_LEDGER_WATERMARK",
                "EXPORT_START",
                "EXPORT_START",
                snapshot.room().capturedAt(),
                generatedAt,
                "UTC",
                "Asia/Seoul",
                new ManifestCounts(
                        counts.events,
                        counts.created,
                        counts.updated,
                        counts.deleted,
                        participantList.size(),
                        job.mode() == ChatExportMode.FULL
                                ? replay.size()
                                : 0),
                descriptors);
        writeJson(
                workspace.manifestFile(),
                manifest,
                workspaceBudget,
                deadline);
        createZip(workspace, descriptors, workspaceBudget, deadline);
        ensureLimits(workspace, deadline);
        long artifactSize = Files.size(workspace.artifactZip());
        if (artifactSize > properties.getMaxArtifactBytes()) {
            throw tooLarge("Export artifact size limit exceeded");
        }
        String artifactSha256 = sha256(
                workspace.artifactZip(),
                deadline);
        return new ChatExportArtifact(
                workspace,
                workspace.artifactZip(),
                artifactSize,
                artifactSha256,
                counts.events,
                counts.created,
                counts.updated,
                counts.deleted,
                participantList.size(),
                generatedAt);
    }

    private void scanLedger(
            ChatExportJob job,
            Map<String, ChatExportParticipantSnapshot> participants,
            Map<String, String> auditIdentities,
            Map<String, ReplayMessage> replay,
            Map<Long, String> roomSequences,
            ReplayBudget replayBudget,
            Counts counts,
            BufferedOutputStream eventsOutput,
            BufferedWriter changes,
            ChatExportDeadline deadline
    ) throws IOException {
        long expected = job.fromChangeSequenceExclusive() + 1;
        long after = job.fromChangeSequenceExclusive();
        while (after < job.toChangeSequenceInclusive()) {
            deadline.check();
            List<ChatMessageAuditEvent> page = auditReader.findChanges(
                    job.roomId(),
                    after,
                    job.toChangeSequenceInclusive(),
                    properties.getAuditPageSize());
            if (page.isEmpty()) {
                throw inconsistent("Audit ledger sequence gap");
            }
            for (ChatMessageAuditEvent event : page) {
                deadline.check();
                if (!job.roomId().equals(event.roomId())
                        || event.roomChangeSequence() != expected
                        || event.roomChangeSequence()
                        > job.toChangeSequenceInclusive()) {
                    throw inconsistent("Audit ledger sequence mismatch");
                }
                validateIdentity(
                        event,
                        participants,
                        auditIdentities);
                if (job.mode() == ChatExportMode.FULL) {
                    replay(
                            event,
                            replay,
                            roomSequences,
                            replayBudget);
                } else {
                    writeChange(
                            changes,
                            event,
                            participants,
                            deadline);
                }
                eventsOutput.write(objectMapper.writeValueAsBytes(
                        ChatExportEventRecord.from(event)));
                eventsOutput.write(NEWLINE);
                counts.add(event.eventType());
                if (counts.events > properties.getMaxEventsPerExport()) {
                    throw tooLarge("Export event count limit exceeded");
                }
                after = event.roomChangeSequence();
                expected++;
            }
        }
        if (expected != job.toChangeSequenceInclusive() + 1) {
            throw inconsistent("Audit ledger ended before watermark");
        }
    }

    private void replay(
            ChatMessageAuditEvent event,
            Map<String, ReplayMessage> replay,
            Map<Long, String> roomSequences,
            ReplayBudget replayBudget
    ) {
        ReplayMessage current = replay.get(event.messageId());
        long priorContentBytes = current == null
                ? 0
                : current.contentBytes();
        if (event.eventType() == ChatMessageAuditEventType.MESSAGE_CREATED) {
            if (current != null
                    || roomSequences.putIfAbsent(
                    event.roomSequence(),
                    event.messageId()) != null) {
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
        replayBudget.contentBytes = Math.addExact(
                Math.subtractExact(
                        replayBudget.contentBytes,
                        priorContentBytes),
                currentContentBytes);
        if (replayBudget.contentBytes
                > properties.getMaxReplayContentBytes()) {
            throw tooLarge("Replay content memory limit exceeded");
        }
    }

    private void validateIdentity(
            ChatMessageAuditEvent event,
            Map<String, ChatExportParticipantSnapshot> participants,
            Map<String, String> auditIdentities
    ) {
        String prior = auditIdentities.putIfAbsent(
                event.senderMembershipId(),
                event.senderUserId());
        if (prior != null && !prior.equals(event.senderUserId())) {
            throw inconsistent("Audit sender identity collision");
        }
        ChatExportParticipantSnapshot participant = participants.get(
                event.senderMembershipId());
        if (participant != null
                && !participant.userId().equals(event.senderUserId())) {
            throw inconsistent("Membership sender identity mismatch");
        }
    }

    private Map<String, ChatExportParticipantSnapshot> participantMap(
            List<ChatExportParticipantSnapshot> participants
    ) {
        Map<String, ChatExportParticipantSnapshot> result = new HashMap<>();
        for (ChatExportParticipantSnapshot participant : participants) {
            if (result.putIfAbsent(
                    participant.membershipId(),
                    participant) != null) {
                throw inconsistent("Duplicate membership identity");
            }
        }
        return result;
    }

    private void addSyntheticParticipants(
            Map<String, ChatExportParticipantSnapshot> participants,
            Map<String, String> identities,
            Instant capturedAt
    ) {
        identities.forEach((membershipId, userId) ->
                participants.computeIfAbsent(
                        membershipId,
                        ignored -> ChatExportParticipantSnapshot.synthetic(
                                membershipId,
                                userId,
                                capturedAt)));
    }

    private List<ChatExportParticipantSnapshot> sortedParticipants(
            Map<String, ChatExportParticipantSnapshot> participants
    ) {
        return participants.values().stream()
                .sorted(Comparator
                        .comparing(
                                ChatExportParticipantSnapshot
                                        ::participantNumber,
                                Comparator.nullsLast(Long::compareTo))
                        .thenComparing(
                                ChatExportParticipantSnapshot::membershipId))
                .toList();
    }

    private void writeTranscript(
            Path file,
            ChatExportRoomSnapshot room,
            Map<String, ChatExportParticipantSnapshot> participants,
            Map<String, ReplayMessage> replay,
            ChatExportWorkspaceBudget workspaceBudget,
            ChatExportDeadline deadline
    ) throws IOException {
        try (BufferedWriter writer = boundedUtf8Writer(
                file,
                properties.getMaxWorkDirectoryBytes(),
                workspaceBudget,
                deadline)) {
            deadline.check();
            writeHtmlHeader(writer, "Full Room transcript", room);
            writeParticipantTable(
                    writer,
                    sortedParticipants(participants),
                    deadline);
            for (ReplayMessage message : replay.values().stream()
                    .sorted(Comparator.comparingLong(value ->
                            value.roomSequence))
                    .toList()) {
                deadline.check();
                ChatExportParticipantSnapshot participant = participants.get(
                        message.senderMembershipId);
                writer.write("<article><h3>[");
                writer.write(escape(HTML_TIME.format(
                        message.snapshot.createdAt())));
                writer.write("] ");
                writer.write(escape(displayName(participant)));
                writer.write("</h3><pre>");
                writer.write(escape(message.visibleContent()));
                writer.write("</pre><p>");
                if (message.snapshot.state()
                        == MessageState.DELETED_BY_AUTHOR) {
                    if (message.editCount > 0) {
                        writer.write(message.editCount + "회 수정됨 · ");
                    }
                    writer.write("작성자에 의해 삭제됨 · ");
                    writer.write(escape(HTML_TIME.format(
                            message.snapshot.deletedAt())));
                } else if (message.editCount > 0) {
                    writer.write(message.editCount + "회 수정됨 · ");
                    writer.write(escape(HTML_TIME.format(
                            message.snapshot.updatedAt())));
                }
                writer.write("</p></article>\n");
            }
            writeHtmlFooter(writer);
        }
        tempManager.secureFile(file);
    }

    private void writeChange(
            BufferedWriter writer,
            ChatMessageAuditEvent event,
            Map<String, ChatExportParticipantSnapshot> participants,
            ChatExportDeadline deadline
    ) throws IOException {
        deadline.check();
        ChatExportParticipantSnapshot participant = participants.get(
                event.senderMembershipId());
        writer.write("<article><h3>");
        writer.write(switch (event.eventType()) {
            case MESSAGE_CREATED -> "신규 메시지";
            case MESSAGE_UPDATED -> "메시지 수정";
            case MESSAGE_DELETED -> "메시지 삭제";
        });
        writer.write(" · ");
        writer.write(escape(displayName(participant)));
        writer.write(" / ");
        writer.write(escape(event.senderUserId()));
        writer.write("</h3>");
        if (event.before() != null && event.before().content() != null) {
            writer.write("<h4>수정/삭제 전</h4><pre>");
            writer.write(escape(event.before().content()));
            writer.write("</pre>");
        }
        if (event.after().content() != null) {
            writer.write("<h4>변경 후</h4><pre>");
            writer.write(escape(event.after().content()));
            writer.write("</pre>");
        }
        if (!event.actorUserId().equals(event.senderUserId())) {
            writer.write("<p>actor: ");
            writer.write(escape(event.actorType().name()));
            writer.write(" / ");
            writer.write(escape(event.actorUserId()));
            writer.write("</p>");
        }
        writer.write("</article>\n");
    }

    private void writeParticipantTable(
            BufferedWriter writer,
            List<ChatExportParticipantSnapshot> participants,
            ChatExportDeadline deadline
    ) throws IOException {
        writer.write("<section><h2>Participants</h2><ul>");
        for (ChatExportParticipantSnapshot participant : participants) {
            deadline.check();
            writer.write("<li>");
            writer.write(escape(displayName(participant)));
            writer.write(" · membershipId: ");
            writer.write(escape(participant.membershipId()));
            writer.write(" · userId: ");
            writer.write(escape(participant.userId()));
            if (participant.status() != null) {
                writer.write(" · status: ");
                writer.write(escape(participant.status().name()));
            }
            writer.write("</li>");
        }
        writer.write("</ul></section>\n");
    }

    private void writeHtmlHeader(
            BufferedWriter writer,
            String title,
            ChatExportRoomSnapshot room
    ) throws IOException {
        writer.write("<!doctype html><html><head><meta charset=\"utf-8\">"
                + "<meta http-equiv=\"Content-Security-Policy\" "
                + "content=\"default-src 'none'; style-src "
                + "'unsafe-inline'; img-src 'none';\">"
                + "<style>body{font-family:sans-serif}pre{white-space:pre-wrap;"
                + "overflow-wrap:anywhere}article{border-top:1px solid #ccc;"
                + "padding:1rem 0}</style><title>");
        writer.write(escape(title));
        writer.write("</title></head><body><h1>");
        writer.write(escape(room.name()));
        writer.write("</h1><p>");
        writer.write(escape(room.description()));
        writer.write("</p>\n");
    }

    private void writeHtmlFooter(BufferedWriter writer) throws IOException {
        writer.write("</body></html>\n");
    }

    private String displayName(ChatExportParticipantSnapshot participant) {
        return participant == null || participant.displayName() == null
                ? "프로필 없음"
                : participant.displayName();
    }

    private String escape(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private void writeJson(
            Path path,
            Object value,
            ChatExportWorkspaceBudget workspaceBudget,
            ChatExportDeadline deadline
    ) throws IOException {
        deadline.check();
        try (BufferedOutputStream output = boundedBinaryOutput(
                path,
                properties.getMaxWorkDirectoryBytes(),
                workspaceBudget,
                deadline)) {
            output.write(objectMapper.writeValueAsBytes(value));
        }
        deadline.check();
        tempManager.secureFile(path);
    }

    private void writeJsonLines(
            Path path,
            List<?> values,
            ChatExportWorkspaceBudget workspaceBudget,
            ChatExportDeadline deadline
    )
            throws IOException {
        try (BufferedOutputStream output = boundedBinaryOutput(
                path,
                properties.getMaxWorkDirectoryBytes(),
                workspaceBudget,
                deadline)) {
            for (Object value : values) {
                deadline.check();
                output.write(objectMapper.writeValueAsBytes(value));
                output.write(NEWLINE);
            }
        }
        tempManager.secureFile(path);
    }

    private BufferedOutputStream boundedBinaryOutput(
            Path path,
            long fileLimit,
            ChatExportWorkspaceBudget workspaceBudget,
            ChatExportDeadline deadline
    ) throws IOException {
        return new BufferedOutputStream(
                new ChatExportBoundedOutputStream(
                        Files.newOutputStream(path),
                        workspaceBudget,
                        fileLimit,
                        deadline));
    }

    private BufferedWriter boundedUtf8Writer(
            Path path,
            long fileLimit,
            ChatExportWorkspaceBudget workspaceBudget,
            ChatExportDeadline deadline
    ) throws IOException {
        return new BufferedWriter(new OutputStreamWriter(
                boundedBinaryOutput(
                        path,
                        fileLimit,
                        workspaceBudget,
                        deadline),
                StandardCharsets.UTF_8));
    }

    private FileDescriptor descriptor(
            String name,
            Path path,
            ChatExportDeadline deadline
    )
            throws IOException {
        deadline.check();
        return new FileDescriptor(
                name,
                Files.size(path),
                sha256(path, deadline));
    }

    private void createZip(
            ChatExportTempWorkspace workspace,
            List<FileDescriptor> descriptors,
            ChatExportWorkspaceBudget workspaceBudget,
            ChatExportDeadline deadline
    ) throws IOException {
        deadline.check();
        try (ZipOutputStream zip = new ZipOutputStream(
                boundedBinaryOutput(
                        workspace.artifactPart(),
                        properties.getMaxArtifactBytes(),
                        workspaceBudget,
                        deadline),
                StandardCharsets.UTF_8)) {
            addZipEntry(
                    zip,
                    "manifest.json",
                    workspace.manifestFile(),
                    deadline);
            for (FileDescriptor descriptor : descriptors) {
                addZipEntry(
                        zip,
                        descriptor.name(),
                        workspace.directory().resolve(descriptor.name()),
                        deadline);
            }
        }
        tempManager.secureFile(workspace.artifactPart());
        deadline.check();
        try {
            Files.move(
                    workspace.artifactPart(),
                    workspace.artifactZip(),
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(
                    workspace.artifactPart(),
                    workspace.artifactZip());
        }
        tempManager.secureFile(workspace.artifactZip());
    }

    private void addZipEntry(
            ZipOutputStream zip,
            String name,
            Path file,
            ChatExportDeadline deadline
    ) throws IOException {
        deadline.check();
        if (!name.matches("[a-z.]+")) {
            throw new IllegalArgumentException("Unsafe ZIP entry name");
        }
        zip.putNextEntry(new ZipEntry(name));
        byte[] buffer = new byte[16_384];
        try (var input = Files.newInputStream(file)) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                deadline.check();
                zip.write(buffer, 0, read);
            }
        }
        zip.closeEntry();
    }

    private String sha256(
            Path file,
            ChatExportDeadline deadline
    ) throws IOException {
        deadline.check();
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
        return java.util.HexFormat.of().formatHex(digest.digest());
    }

    private void ensureLimits(
            ChatExportTempWorkspace workspace,
            ChatExportDeadline deadline
    ) throws IOException {
        deadline.check();
        if (tempManager.workspaceSize(workspace.directory())
                > properties.getMaxWorkDirectoryBytes()) {
            throw tooLarge("Export workspace size limit exceeded");
        }
    }

    private ChatExportException tooLarge(String message) {
        return new ChatExportException(
                ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE,
                org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE,
                false,
                message);
    }

    private ChatExportException inconsistent(String message) {
        return new ChatExportException(
                ChatExportErrorCode.CHAT_EXPORT_LEDGER_INCONSISTENT,
                org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
                false,
                message);
    }

    private static final class Counts {
        long events;
        long created;
        long updated;
        long deleted;

        void add(ChatMessageAuditEventType type) {
            events++;
            switch (type) {
                case MESSAGE_CREATED -> created++;
                case MESSAGE_UPDATED -> updated++;
                case MESSAGE_DELETED -> deleted++;
            }
        }
    }

    private static final class ReplayBudget {

        private long contentBytes;
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

        String visibleContent() {
            return snapshot.state() == MessageState.DELETED_BY_AUTHOR
                    ? lastVisibleContent
                    : snapshot.content();
        }

        long contentBytes() {
            String content = visibleContent();
            return content == null
                    ? 0
                    : content.getBytes(StandardCharsets.UTF_8).length;
        }
    }

    private record FileDescriptor(
            String name,
            long sizeBytes,
            String sha256
    ) {
    }

    private record ManifestCounts(
            long events,
            long created,
            long updated,
            long deleted,
            long participants,
            long messagesInTranscript
    ) {
    }

    private record Manifest(
            int exportSchemaVersion,
            String exportId,
            String roomId,
            ChatExportMode mode,
            String baseExportId,
            long fromChangeSequenceExclusive,
            long toChangeSequenceInclusive,
            String identityMode,
            String messageStateSemantics,
            String roomSnapshotSemantics,
            String participantSnapshotSemantics,
            Instant capturedAt,
            Instant generatedAt,
            String jsonTimezone,
            String htmlTimezone,
            ManifestCounts counts,
            List<FileDescriptor> files
    ) {
    }
}
