package com.hamcheeze.chat.export;

import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatExportServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-11T03:00:00Z");

    @TempDir
    Path tempDirectory;

    private ChatExportJobStore jobStore;
    private ChatMessageAuditReader auditReader;
    private ChatExportSnapshotReader snapshotReader;
    private ChatExportArtifactGenerator artifactGenerator;
    private ChatExportTempManager tempManager;
    private ChatExportConcurrencyGuard concurrencyGuard;
    private ChatExportService service;

    @BeforeEach
    void setUp() {
        jobStore = mock(ChatExportJobStore.class);
        auditReader = mock(ChatMessageAuditReader.class);
        snapshotReader = mock(ChatExportSnapshotReader.class);
        artifactGenerator = mock(ChatExportArtifactGenerator.class);
        tempManager = mock(ChatExportTempManager.class);
        concurrencyGuard = new ChatExportConcurrencyGuard(1);
        ChatExportProperties properties = new ChatExportProperties();
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        service = new ChatExportService(
                jobStore,
                auditReader,
                snapshotReader,
                artifactGenerator,
                tempManager,
                concurrencyGuard,
                properties,
                clock,
                new ChatExportMetrics(new SimpleMeterRegistry()));
    }

    @Test
    void incrementalUsesLatestSucceededForSameRoomAndAdmin()
            throws Exception {
        ChatExportJob base = succeededJob(
                "base-export",
                "admin-1",
                10);
        ChatExportSnapshot snapshot = mock(ChatExportSnapshot.class);
        ChatExportTempWorkspace workspace = workspace("generated-export");
        ChatExportArtifact artifact = artifact(workspace);
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenReturn(Optional.of(snapshot));
        when(jobStore.findLatestSucceeded("room-1", "admin-1"))
                .thenReturn(Optional.of(base));
        when(auditReader.currentRoomChangeSequence("room-1"))
                .thenReturn(15L);
        when(tempManager.create(any(), eq(ChatExportMode.INCREMENTAL)))
                .thenReturn(workspace);
        when(artifactGenerator.generate(any(), eq(snapshot), eq(workspace)))
                .thenReturn(artifact);

        try (ChatExportExecution ignored = service.prepare(
                "admin-1",
                "room-1",
                ChatExportMode.INCREMENTAL)) {
            ArgumentCaptor<ChatExportJob> job = ArgumentCaptor.forClass(
                    ChatExportJob.class);
            verify(jobStore).insertRunning(job.capture());
            assertThat(job.getValue().baseExportId()).isEqualTo(
                    "base-export");
            assertThat(job.getValue().fromChangeSequenceExclusive())
                    .isEqualTo(10);
            assertThat(job.getValue().toChangeSequenceInclusive())
                    .isEqualTo(15);
            assertThat(job.getValue().requestedByAdminId()).isEqualTo(
                    "admin-1");
        }
    }

    @Test
    void incrementalWithoutOwnSuccessfulBaseIsRejected() {
        ChatExportSnapshot snapshot = mock(ChatExportSnapshot.class);
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenReturn(Optional.of(snapshot));
        when(jobStore.findLatestSucceeded("room-1", "admin-2"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.prepare(
                "admin-2",
                "room-1",
                ChatExportMode.INCREMENTAL))
                .isInstanceOf(ChatExportException.class)
                .satisfies(exception -> assertThat(
                        ((ChatExportException) exception).code())
                        .isEqualTo(ChatExportErrorCode
                                .CHAT_EXPORT_BASE_NOT_FOUND));
        verify(jobStore, never()).insertRunning(any());
    }

    @Test
    void generationFailureDoesNotAdvanceCheckpoint() throws Exception {
        ChatExportSnapshot snapshot = mock(ChatExportSnapshot.class);
        ChatExportTempWorkspace workspace = workspace("failed-export");
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenReturn(Optional.of(snapshot));
        when(auditReader.currentRoomChangeSequence("room-1"))
                .thenReturn(5L);
        when(tempManager.create(any(), eq(ChatExportMode.FULL)))
                .thenReturn(workspace);
        when(artifactGenerator.generate(any(), eq(snapshot), eq(workspace)))
                .thenThrow(new ChatExportException(
                        ChatExportErrorCode
                                .CHAT_EXPORT_LEDGER_INCONSISTENT,
                        org.springframework.http.HttpStatus
                                .INTERNAL_SERVER_ERROR,
                        false,
                        "ledger inconsistent"));

        assertThatThrownBy(() -> service.prepare(
                "admin-1",
                "room-1",
                ChatExportMode.FULL))
                .isInstanceOf(ChatExportException.class);

        verify(jobStore).markFailed(
                any(),
                eq(ChatExportFailureCode.LEDGER_INCONSISTENT),
                eq(NOW));
        verify(jobStore, never()).markSucceeded(any(), any());
        verify(tempManager).cleanupBestEffort(workspace);
    }

    @Test
    void oversizedEventRangeFailsBeforeWorkspaceCreation()
            throws Exception {
        ChatExportSnapshot snapshot = mock(ChatExportSnapshot.class);
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenReturn(Optional.of(snapshot));
        when(auditReader.currentRoomChangeSequence("room-1"))
                .thenReturn(100_001L);

        assertThatThrownBy(() -> service.prepare(
                "admin-1",
                "room-1",
                ChatExportMode.FULL))
                .isInstanceOf(ChatExportException.class)
                .satisfies(exception -> {
                    ChatExportException exportException =
                            (ChatExportException) exception;
                    assertThat(exportException.code()).isEqualTo(
                            ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE);
                    assertThat(exportException.retryable()).isFalse();
                });

        verify(jobStore).insertRunning(any());
        verify(jobStore).markFailed(
                any(),
                eq(ChatExportFailureCode.TOO_LARGE),
                eq(NOW));
        verify(tempManager, never()).create(any(), any());
        verify(artifactGenerator, never()).generate(any(), any(), any());
        assertThat(concurrencyGuard.tryAcquire()).isNotNull();
    }

    @Test
    void unstableSnapshotIsRetryableAndCreatesNoJob()
            throws Exception {
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenThrow(new ChatExportSnapshotUnstableException(
                        "unstable"));

        assertThatThrownBy(() -> service.prepare(
                "admin-1",
                "room-1",
                ChatExportMode.FULL))
                .isInstanceOf(ChatExportException.class)
                .satisfies(exception -> {
                    ChatExportException exportException =
                            (ChatExportException) exception;
                    assertThat(exportException.code()).isEqualTo(
                            ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE);
                    assertThat(exportException.retryable()).isTrue();
                });

        verify(jobStore, never()).insertRunning(any());
        verify(tempManager, never()).create(any(), any());
        assertThat(concurrencyGuard.tryAcquire()).isNotNull();
    }

    private ChatExportJob succeededJob(
            String exportId,
            String adminId,
            long watermark
    ) {
        return new ChatExportJob(
                exportId,
                1,
                "room-1",
                ChatExportMode.FULL,
                null,
                0,
                watermark,
                ChatExportStatus.SUCCEEDED,
                adminId,
                NOW.minusSeconds(30),
                NOW.minusSeconds(30),
                NOW.minusSeconds(10),
                NOW.minusSeconds(10),
                watermark,
                watermark,
                0,
                0,
                100L,
                "a".repeat(64),
                null);
    }

    private ChatExportTempWorkspace workspace(String exportId) {
        return new ChatExportTempWorkspace(
                exportId,
                tempDirectory.resolve(exportId),
                tempDirectory.resolve("room.json"),
                tempDirectory.resolve("participants.jsonl"),
                tempDirectory.resolve("events.jsonl"),
                tempDirectory.resolve("transcript.html"),
                tempDirectory.resolve("manifest.json"),
                tempDirectory.resolve("artifact.part"),
                tempDirectory.resolve("artifact.zip"));
    }

    private ChatExportArtifact artifact(ChatExportTempWorkspace workspace) {
        return new ChatExportArtifact(
                workspace,
                workspace.artifactZip(),
                100,
                "b".repeat(64),
                5,
                5,
                0,
                0,
                1,
                NOW);
    }
}
