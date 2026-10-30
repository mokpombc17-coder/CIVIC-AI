package com.hamcheeze.chat.export;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;

import java.io.IOException;
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
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ResearchChatExportServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-24T03:00:00Z");

    @TempDir
    Path tempDirectory;

    private ResearchChatExportJobStore jobStore;
    private ResearchChatExportSnapshotReader snapshotReader;
    private ResearchChatExportArtifactGenerator generator;
    private ChatExportTempManager tempManager;
    private ChatExportConcurrencyGuard guard;
    private ChatExportProperties properties;
    private ResearchChatExportService service;

    @BeforeEach
    void setUp() {
        jobStore = mock(ResearchChatExportJobStore.class);
        snapshotReader = mock(ResearchChatExportSnapshotReader.class);
        generator = mock(ResearchChatExportArtifactGenerator.class);
        tempManager = mock(ChatExportTempManager.class);
        guard = new ChatExportConcurrencyGuard(1);
        properties = new ChatExportProperties();
        service = service(guard);
    }

    @Test
    void missingRoomIsNotFoundAndCreatesNoJob() throws Exception {
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenReturn(Optional.empty());

        assertCode(ChatExportErrorCode.ROOM_NOT_FOUND,
                () -> service.prepare("researcher-1", "room-1"));

        verify(jobStore, never()).insertRunning(any());
        verify(tempManager, never()).createResearch(any());
        assertThat(guard.tryAcquire()).isNotNull();
    }

    @Test
    void unstableSnapshotAndGlobalCapacityAreRetryable() {
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenThrow(new ChatExportSnapshotUnstableException(
                        "unstable"));

        assertThatThrownBy(() -> service.prepare(
                "researcher-1", "room-1"))
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> {
                    ChatExportException export = (ChatExportException) error;
                    assertThat(export.code()).isEqualTo(
                            ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE);
                    assertThat(export.retryable()).isTrue();
                });

        ChatExportConcurrencyGuard occupied =
                new ChatExportConcurrencyGuard(1);
        ChatExportConcurrencyGuard.Permit permit = occupied.tryAcquire();
        ResearchChatExportService capacityService = service(occupied);
        assertThatThrownBy(() -> capacityService.prepare(
                "researcher-1", "room-1"))
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> assertThat(
                        ((ChatExportException) error).retryable()).isTrue());
        permit.close();
    }

    @Test
    void eventLimitFailsBeforeWorkspaceCreation() throws Exception {
        properties.setMaxEventsPerExport(2);
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenReturn(Optional.of(snapshot(3)));

        assertCode(ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE,
                () -> service.prepare("researcher-1", "room-1"));

        verify(jobStore).insertRunning(any());
        verify(jobStore).markFailed(any(),
                eq(ChatExportFailureCode.TOO_LARGE), eq(NOW));
        verify(tempManager, never()).createResearch(any());
        verify(generator, never()).generate(any(), any(), any());
        assertThat(guard.tryAcquire()).isNotNull();
    }

    @Test
    void duplicateRunningRoomIsConflict() throws Exception {
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenReturn(Optional.of(snapshot(0)));
        doThrow(new DuplicateKeyException("running room"))
                .when(jobStore).insertRunning(any());

        assertCode(ChatExportErrorCode.CHAT_EXPORT_ALREADY_RUNNING,
                () -> service.prepare("researcher-1", "room-1"));

        verify(tempManager, never()).createResearch(any());
        assertThat(guard.tryAcquire()).isNotNull();
    }

    @Test
    void generationFailureMarksFailedCleansAndReleasesPermit()
            throws Exception {
        ResearchChatExportTempWorkspace workspace = workspace();
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenReturn(Optional.of(snapshot(1)));
        when(tempManager.createResearch(any())).thenReturn(workspace);
        when(generator.generate(any(), any(), eq(workspace)))
                .thenThrow(new ChatExportException(
                        ChatExportErrorCode.CHAT_EXPORT_LEDGER_INCONSISTENT,
                        org.springframework.http.HttpStatus
                                .INTERNAL_SERVER_ERROR,
                        false,
                        "ledger"));

        assertCode(ChatExportErrorCode.CHAT_EXPORT_LEDGER_INCONSISTENT,
                () -> service.prepare("researcher-1", "room-1"));

        verify(jobStore).markFailed(any(),
                eq(ChatExportFailureCode.LEDGER_INCONSISTENT), eq(NOW));
        verify(tempManager).cleanupResearchBestEffort(workspace);
        assertThat(guard.tryAcquire()).isNotNull();
    }

    @Test
    void successfulPreparationCapturesResearcherAndWatermark()
            throws Exception {
        ResearchChatExportSnapshot snapshot = snapshot(7);
        ResearchChatExportTempWorkspace workspace = workspace();
        when(snapshotReader.findStable(eq("room-1"), any(), anyInt()))
                .thenReturn(Optional.of(snapshot));
        when(tempManager.createResearch(any())).thenReturn(workspace);
        when(generator.generate(any(), eq(snapshot), eq(workspace)))
                .thenAnswer(invocation -> artifact(
                        invocation.getArgument(0), workspace));

        try (ResearchChatExportExecution ignored = service.prepare(
                "researcher-1", "room-1")) {
            ArgumentCaptor<ResearchChatExportJob> captured =
                    ArgumentCaptor.forClass(ResearchChatExportJob.class);
            verify(jobStore).insertRunning(captured.capture());
            assertThat(captured.getValue().capturedChangeSequence())
                    .isEqualTo(7);
            assertThat(captured.getValue().requestedByResearcherId())
                    .isEqualTo("researcher-1");
        }
        verify(tempManager).cleanupResearchBestEffort(workspace);
        assertThat(guard.tryAcquire()).isNotNull();
    }

    private ResearchChatExportService service(
            ChatExportConcurrencyGuard concurrencyGuard
    ) {
        return new ResearchChatExportService(
                jobStore, snapshotReader, generator, tempManager,
                concurrencyGuard, properties,
                Clock.fixed(NOW, ZoneOffset.UTC),
                new ResearchChatExportMetrics(new SimpleMeterRegistry()));
    }

    private ResearchChatExportSnapshot snapshot(long watermark) {
        return new ResearchChatExportSnapshot(
                null, List.of(), List.of(), watermark, NOW);
    }

    private ResearchChatExportTempWorkspace workspace() {
        return new ResearchChatExportTempWorkspace(
                "11111111-1111-1111-1111-111111111111",
                tempDirectory,
                tempDirectory.resolve("messages.jsonl"),
                tempDirectory.resolve("message_changes.jsonl"),
                tempDirectory.resolve("transcript.html"),
                tempDirectory.resolve("metadata.json"),
                tempDirectory.resolve("artifact.part"),
                tempDirectory.resolve("artifact.zip"));
    }

    private ResearchChatExportArtifact artifact(
            ResearchChatExportJob job,
            ResearchChatExportTempWorkspace workspace
    ) {
        return new ResearchChatExportArtifact(
                workspace, workspace.artifactZip(), 12, "a".repeat(64),
                1, job.capturedChangeSequence(), 1, 0, 0, NOW);
    }

    private void assertCode(
            ChatExportErrorCode expected,
            ThrowingOperation operation
    ) {
        assertThatThrownBy(operation::run)
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> assertThat(
                        ((ChatExportException) error).code())
                        .isEqualTo(expected));
    }

    @FunctionalInterface
    private interface ThrowingOperation {
        void run() throws IOException;
    }
}
