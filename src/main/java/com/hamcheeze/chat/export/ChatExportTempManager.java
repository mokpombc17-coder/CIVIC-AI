package com.hamcheeze.chat.export;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public final class ChatExportTempManager {

    private static final Logger log = LoggerFactory.getLogger(
            ChatExportTempManager.class);
    private static final Set<PosixFilePermission> DIRECTORY_PERMISSIONS =
            EnumSet.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE,
                    PosixFilePermission.OWNER_EXECUTE);
    private static final Set<PosixFilePermission> FILE_PERMISSIONS =
            EnumSet.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE);

    private final ChatExportProperties properties;
    private final Clock clock;
    private final Path root;
    private final ChatExportUsableSpaceReader usableSpaceReader;
    private final Set<String> activeExportIds = ConcurrentHashMap.newKeySet();
    private final Counter cleanupAttempts;
    private final Counter cleanupFailures;
    private final Counter orphansDeleted;
    private final Counter orphanBytes;

    public ChatExportTempManager(
            ChatExportProperties properties,
            Clock clock,
            MeterRegistry meterRegistry
    ) {
        this(
                properties,
                clock,
                meterRegistry,
                ChatExportUsableSpaceReader.fileStore());
    }

    ChatExportTempManager(
            ChatExportProperties properties,
            Clock clock,
            MeterRegistry meterRegistry,
            ChatExportUsableSpaceReader usableSpaceReader
    ) {
        this.properties = properties;
        this.clock = clock;
        this.usableSpaceReader = usableSpaceReader;
        this.root = properties.getTempRoot()
                .toAbsolutePath()
                .normalize();
        cleanupAttempts = counterBestEffort(meterRegistry,
                "chat.export.temp.cleanup.attempts",
                Tags.empty());
        cleanupFailures = counterBestEffort(meterRegistry,
                "chat.export.temp.cleanup.failures",
                Tags.empty());
        orphansDeleted = counterBestEffort(meterRegistry,
                "chat.export.temp.orphans.deleted",
                Tags.empty());
        orphanBytes = counterBestEffort(meterRegistry,
                "chat.export.temp.orphans.bytes",
                Tags.empty());
    }

    public void initialize() {
        try {
            Files.createDirectories(root);
            applyDirectoryPermissions(root);
            if (!Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS)
                    || Files.isSymbolicLink(root)
                    || !Files.isWritable(root)) {
                throw new IllegalStateException(
                        "Export temp root is not private and writable");
            }
            cleanupOrphans();
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "Cannot initialize export temp root",
                    exception);
        }
    }

    public ChatExportTempWorkspace create(
            String exportId,
            ChatExportMode mode
    ) throws IOException {
        requireExportId(exportId);
        ensureFreeDisk();
        Path directory = safeWorkspace(exportId);
        Files.createDirectory(directory);
        applyDirectoryPermissions(directory);
        activeExportIds.add(exportId);
        String htmlName = mode == ChatExportMode.FULL
                ? "transcript.html"
                : "changes.html";
        return new ChatExportTempWorkspace(
                exportId,
                directory,
                directory.resolve("room.json"),
                directory.resolve("participants.jsonl"),
                directory.resolve("events.jsonl"),
                directory.resolve(htmlName),
                directory.resolve("manifest.json"),
                directory.resolve("artifact.part"),
                directory.resolve("artifact.zip"));
    }

    public ResearchChatExportTempWorkspace createResearch(
            String exportId
    ) throws IOException {
        requireExportId(exportId);
        ensureFreeDisk();
        Path directory = safeWorkspace(exportId);
        Files.createDirectory(directory);
        applyDirectoryPermissions(directory);
        activeExportIds.add(exportId);
        return new ResearchChatExportTempWorkspace(
                exportId,
                directory,
                directory.resolve("messages.jsonl"),
                directory.resolve("message_changes.jsonl"),
                directory.resolve("transcript.html"),
                directory.resolve("manifest.json"),
                directory.resolve("artifact.part"),
                directory.resolve("artifact.zip"));
    }

    public AdminRoomConversationExportTempWorkspace
            createAdminConversation(String exportId) throws IOException {
        requireExportId(exportId);
        ensureFreeDisk();
        Path directory = safeWorkspace(exportId);
        Files.createDirectory(directory);
        applyDirectoryPermissions(directory);
        activeExportIds.add(exportId);
        return new AdminRoomConversationExportTempWorkspace(
                exportId,
                directory,
                directory.resolve("messages.jsonl"),
                directory.resolve("message_changes.jsonl"),
                directory.resolve("transcript.html"),
                directory.resolve("manifest.json"),
                directory.resolve("artifact.part"),
                directory.resolve("artifact.zip"));
    }

    public void secureFile(Path file) throws IOException {
        ensureUnderRoot(file);
        try {
            Files.setPosixFilePermissions(file, FILE_PERMISSIONS);
        } catch (UnsupportedOperationException ignored) {
        }
    }

    public void cleanupBestEffort(ChatExportTempWorkspace workspace) {
        if (workspace == null) {
            return;
        }
        cleanupBestEffort(workspace.exportId(), workspace.directory());
    }

    public void cleanupResearchBestEffort(
            ResearchChatExportTempWorkspace workspace
    ) {
        if (workspace == null) {
            return;
        }
        cleanupBestEffort(workspace.exportId(), workspace.directory());
    }

    public void cleanupAdminConversationBestEffort(
            AdminRoomConversationExportTempWorkspace workspace
    ) {
        if (workspace == null) {
            return;
        }
        cleanupBestEffort(workspace.exportId(), workspace.directory());
    }

    private void cleanupBestEffort(String exportId, Path directory) {
        activeExportIds.remove(exportId);
        try {
            deleteWorkspace(directory);
        } catch (RuntimeException | IOException exception) {
            incrementBestEffort(cleanupFailures);
            log.warn(
                    "Failed to clean chat export workspace: {}",
                    exception.getClass().getSimpleName());
        } finally {
            incrementBestEffort(cleanupAttempts);
        }
    }

    @Scheduled(fixedDelayString = "${chat.export.cleanup-interval:15m}")
    public void scheduledCleanup() {
        cleanupOrphans();
    }

    public void cleanupOrphans() {
        Instant threshold = clock.instant().minus(properties.getOrphanTtl());
        try (var directories = Files.list(root)) {
            directories
                    .filter(path -> Files.isDirectory(
                            path,
                            LinkOption.NOFOLLOW_LINKS))
                    .filter(path -> !Files.isSymbolicLink(path))
                    .filter(path -> isExportId(path.getFileName().toString()))
                    .filter(path -> !activeExportIds.contains(
                            path.getFileName().toString()))
                    .filter(path -> modifiedBefore(path, threshold))
                    .forEach(this::deleteOrphanBestEffort);
        } catch (IOException exception) {
            incrementBestEffort(cleanupFailures);
            log.warn(
                    "Failed to scan chat export temp root: {}",
                    exception.getClass().getSimpleName());
        } finally {
            incrementBestEffort(cleanupAttempts);
        }
    }

    public long workspaceSize(Path directory) throws IOException {
        ensureUnderRoot(directory);
        try (var files = Files.walk(directory)) {
            return files
                    .filter(path -> Files.isRegularFile(
                            path,
                            LinkOption.NOFOLLOW_LINKS))
                    .mapToLong(this::sizeUnchecked)
                    .sum();
        }
    }

    private void ensureFreeDisk() throws IOException {
        final long requiredUsableBytes;
        try {
            requiredUsableBytes = Math.addExact(
                    properties.getMinFreeDiskBytes(),
                    properties.getMaxWorkDirectoryBytes());
        } catch (ArithmeticException exception) {
            throw new IOException(
                    "Invalid export temp disk reservation",
                    exception);
        }
        if (usableSpaceReader.usableBytes(root) < requiredUsableBytes) {
            throw new IOException("Insufficient export temp disk space");
        }
    }

    private Path safeWorkspace(String exportId) {
        Path target = root.resolve(exportId).normalize();
        ensureUnderRoot(target);
        return target;
    }

    private void ensureUnderRoot(Path target) {
        Path normalized = target.toAbsolutePath().normalize();
        if (!normalized.startsWith(root) || normalized.equals(root)) {
            throw new IllegalArgumentException(
                    "Export workspace escaped temp root");
        }
    }

    private void deleteWorkspace(Path directory) throws IOException {
        ensureUnderRoot(directory);
        if (Files.isSymbolicLink(directory)) {
            throw new IllegalArgumentException(
                    "Symbolic export workspace is forbidden");
        }
        if (!Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) {
            return;
        }
        try (var paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                if (Files.isSymbolicLink(path)
                        && !path.equals(directory)) {
                    Files.deleteIfExists(path);
                } else {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    private void deleteOrphanBestEffort(Path directory) {
        try {
            long bytes = workspaceSize(directory);
            deleteWorkspace(directory);
            incrementBestEffort(orphansDeleted);
            incrementBestEffort(orphanBytes, bytes);
        } catch (RuntimeException | IOException exception) {
            incrementBestEffort(cleanupFailures);
            log.warn(
                    "Failed to delete orphan export workspace: {}",
                    exception.getClass().getSimpleName());
        }
    }

    private boolean modifiedBefore(Path path, Instant threshold) {
        try {
            return Files.getLastModifiedTime(
                            path,
                            LinkOption.NOFOLLOW_LINKS)
                    .toInstant()
                    .isBefore(threshold);
        } catch (IOException exception) {
            incrementBestEffort(cleanupFailures);
            return false;
        }
    }

    private long sizeUnchecked(Path path) {
        try {
            return Files.size(path);
        } catch (IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private void applyDirectoryPermissions(Path directory)
            throws IOException {
        try {
            Files.setPosixFilePermissions(
                    directory,
                    DIRECTORY_PERMISSIONS);
        } catch (UnsupportedOperationException ignored) {
        }
    }

    private void requireExportId(String exportId) {
        if (!isExportId(exportId)) {
            throw new IllegalArgumentException("Invalid export ID");
        }
    }

    private boolean isExportId(String value) {
        try {
            return java.util.UUID.fromString(value).toString().equals(value);
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private static Counter counterBestEffort(
            MeterRegistry meterRegistry,
            String name,
            Tags tags
    ) {
        try {
            return meterRegistry.counter(name, tags);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static void incrementBestEffort(Counter counter) {
        incrementBestEffort(counter, 1.0);
    }

    private static void incrementBestEffort(Counter counter, double amount) {
        if (counter == null) {
            return;
        }
        try {
            counter.increment(amount);
        } catch (RuntimeException ignored) {
            // Export cleanup must not depend on metric availability.
        }
    }
}
