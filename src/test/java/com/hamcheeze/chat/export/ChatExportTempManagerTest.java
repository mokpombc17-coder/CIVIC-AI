package com.hamcheeze.chat.export;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatExportTempManagerTest {

    private static final Instant NOW =
            Instant.parse("2026-08-11T05:00:00Z");

    @TempDir
    Path tempDirectory;

    @Test
    void immediateCleanupRemovesCompletedWorkspace() throws Exception {
        ChatExportTempManager manager = manager();
        ChatExportTempWorkspace workspace = manager.create(
                "11111111-1111-1111-1111-111111111111",
                ChatExportMode.FULL);
        Files.writeString(workspace.roomFile(), "room");

        manager.cleanupBestEffort(workspace);

        assertThat(workspace.directory()).doesNotExist();
    }

    @Test
    void orphanCleanupDeletesOldWorkspaceButProtectsActiveOne()
            throws Exception {
        ChatExportTempManager manager = manager();
        ChatExportTempWorkspace active = manager.create(
                "22222222-2222-2222-2222-222222222222",
                ChatExportMode.FULL);
        Path orphan = tempDirectory.resolve(
                "33333333-3333-3333-3333-333333333333");
        Files.createDirectory(orphan);
        Files.writeString(orphan.resolve("artifact.part"), "partial");
        FileTime old = FileTime.from(NOW.minus(Duration.ofHours(2)));
        Files.setLastModifiedTime(orphan, old);
        Files.setLastModifiedTime(active.directory(), old);

        manager.cleanupOrphans();

        assertThat(orphan).doesNotExist();
        assertThat(active.directory()).exists();
        manager.cleanupBestEffort(active);
    }

    @Test
    void pathsOutsideConfiguredRootAreRejected() {
        ChatExportTempManager manager = manager();

        assertThatThrownBy(() -> manager.workspaceSize(
                tempDirectory.getParent()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void workspaceRequiresReservedDiskInAdditionToMinimumFreeSpace() {
        ChatExportProperties properties = new ChatExportProperties();
        properties.setTempRoot(tempDirectory);
        properties.setMinFreeDiskBytes(100);
        properties.setMaxWorkDirectoryBytes(200);
        properties.setMaxArtifactBytes(100);
        ChatExportTempManager manager = new ChatExportTempManager(
                properties,
                Clock.fixed(NOW, ZoneOffset.UTC),
                new SimpleMeterRegistry(),
                ignored -> 299);
        manager.initialize();

        assertThatThrownBy(() -> manager.create(
                "44444444-4444-4444-4444-444444444444",
                ChatExportMode.FULL))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("Insufficient export temp disk");
    }

    @Test
    void v1RejectsMoreThanOneConcurrentExport() {
        ChatExportProperties properties = new ChatExportProperties();
        properties.setMaxConcurrentExports(2);

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void failingCleanupMetricsDoNotPreventWorkspaceDeletion()
            throws Exception {
        MeterRegistry registry = mock(MeterRegistry.class);
        Counter counter = mock(Counter.class);
        when(registry.counter(
                anyString(),
                any(Iterable.class)))
                .thenReturn(counter);
        doThrow(new IllegalStateException("metric failed"))
                .when(counter)
                .increment(anyDouble());
        ChatExportProperties properties = new ChatExportProperties();
        properties.setTempRoot(tempDirectory);
        properties.setMinFreeDiskBytes(0);
        ChatExportTempManager manager = new ChatExportTempManager(
                properties,
                Clock.fixed(NOW, ZoneOffset.UTC),
                registry,
                ignored -> Long.MAX_VALUE);
        manager.initialize();
        ChatExportTempWorkspace workspace = manager.create(
                "55555555-5555-5555-5555-555555555555",
                ChatExportMode.FULL);
        Files.writeString(workspace.roomFile(), "room");

        manager.cleanupBestEffort(workspace);

        assertThat(workspace.directory()).doesNotExist();
    }

    private ChatExportTempManager manager() {
        ChatExportProperties properties = new ChatExportProperties();
        properties.setTempRoot(tempDirectory);
        properties.setMinFreeDiskBytes(0);
        properties.setOrphanTtl(Duration.ofHours(1));
        ChatExportTempManager manager = new ChatExportTempManager(
                properties,
                Clock.fixed(NOW, ZoneOffset.UTC),
                new SimpleMeterRegistry());
        manager.initialize();
        return manager;
    }
}
