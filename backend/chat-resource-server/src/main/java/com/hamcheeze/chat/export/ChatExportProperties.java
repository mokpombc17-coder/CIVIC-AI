package com.hamcheeze.chat.export;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.time.Duration;

@ConfigurationProperties("chat.export")
public class ChatExportProperties {

    private Path tempRoot = Path.of("/tmp/chat-export-tmp");
    private int maxConcurrentExports = 1;
    private int auditPageSize = 1_000;
    private int maxEventsPerExport = 100_000;
    private int maxDistinctMessagesFull = 50_000;
    private long maxReplayContentBytes = 134_217_728L;
    private long maxArtifactBytes = 268_435_456L;
    private long maxWorkDirectoryBytes = 536_870_912L;
    private Duration maxGenerationDuration = Duration.ofSeconds(120);
    private long minFreeDiskBytes = 1_073_741_824L;
    private Duration cleanupInterval = Duration.ofMinutes(15);
    private Duration orphanTtl = Duration.ofHours(1);
    private int snapshotMaxAttempts = 3;
    private Duration maxConversationExportRange = Duration.ofDays(31);

    @PostConstruct
    void validate() {
        boolean diskReservationOverflows;
        try {
            Math.addExact(minFreeDiskBytes, maxWorkDirectoryBytes);
            diskReservationOverflows = false;
        } catch (ArithmeticException exception) {
            diskReservationOverflows = true;
        }
        if (tempRoot == null
                || auditPageSize < 1
                || auditPageSize > 1_000
                || maxEventsPerExport < auditPageSize
                || maxDistinctMessagesFull < 1
                || maxReplayContentBytes < 1
                || maxArtifactBytes < 1
                || maxWorkDirectoryBytes < maxArtifactBytes
                || maxGenerationDuration == null
                || maxGenerationDuration.isZero()
                || maxGenerationDuration.isNegative()
                || minFreeDiskBytes < 0
                || cleanupInterval == null
                || cleanupInterval.isZero()
                || cleanupInterval.isNegative()
                || orphanTtl == null
                || orphanTtl.compareTo(maxGenerationDuration) <= 0
                || maxConcurrentExports != 1
                || diskReservationOverflows
                || snapshotMaxAttempts < 1
                || maxConversationExportRange == null
                || maxConversationExportRange.isZero()
                || maxConversationExportRange.isNegative()) {
            throw new IllegalStateException("Invalid chat export properties");
        }
    }

    public Path getTempRoot() { return tempRoot; }
    public void setTempRoot(Path value) { tempRoot = value; }
    public int getMaxConcurrentExports() { return maxConcurrentExports; }
    public void setMaxConcurrentExports(int value) {
        maxConcurrentExports = value;
    }
    public int getAuditPageSize() { return auditPageSize; }
    public void setAuditPageSize(int value) { auditPageSize = value; }
    public int getMaxEventsPerExport() { return maxEventsPerExport; }
    public void setMaxEventsPerExport(int value) {
        maxEventsPerExport = value;
    }
    public int getMaxDistinctMessagesFull() {
        return maxDistinctMessagesFull;
    }
    public void setMaxDistinctMessagesFull(int value) {
        maxDistinctMessagesFull = value;
    }
    public long getMaxReplayContentBytes() {
        return maxReplayContentBytes;
    }
    public void setMaxReplayContentBytes(long value) {
        maxReplayContentBytes = value;
    }
    public long getMaxArtifactBytes() { return maxArtifactBytes; }
    public void setMaxArtifactBytes(long value) { maxArtifactBytes = value; }
    public long getMaxWorkDirectoryBytes() {
        return maxWorkDirectoryBytes;
    }
    public void setMaxWorkDirectoryBytes(long value) {
        maxWorkDirectoryBytes = value;
    }
    public Duration getMaxGenerationDuration() {
        return maxGenerationDuration;
    }
    public void setMaxGenerationDuration(Duration value) {
        maxGenerationDuration = value;
    }
    public long getMinFreeDiskBytes() { return minFreeDiskBytes; }
    public void setMinFreeDiskBytes(long value) { minFreeDiskBytes = value; }
    public Duration getCleanupInterval() { return cleanupInterval; }
    public void setCleanupInterval(Duration value) { cleanupInterval = value; }
    public Duration getOrphanTtl() { return orphanTtl; }
    public void setOrphanTtl(Duration value) { orphanTtl = value; }
    public int getSnapshotMaxAttempts() { return snapshotMaxAttempts; }
    public void setSnapshotMaxAttempts(int value) {
        snapshotMaxAttempts = value;
    }
    public Duration getMaxConversationExportRange() {
        return maxConversationExportRange;
    }
    public void setMaxConversationExportRange(Duration value) {
        maxConversationExportRange = value;
    }
}
