package com.hamcheeze.chat.export;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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

class AdminRoomConversationExportServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-29T08:00:00Z");
    private static final String SHA = "a".repeat(64);

    private AdminRoomConversationExportJobStore jobStore;
    private AdminRoomConversationExportSnapshotReader snapshotReader;
    private AdminRoomConversationExportArtifactGenerator artifactGenerator;
    private ChatExportTempManager tempManager;
    private AdminRoomConversationExportService service;

    @BeforeEach
    void setUp() {
        jobStore = mock(AdminRoomConversationExportJobStore.class);
        snapshotReader = mock(
                AdminRoomConversationExportSnapshotReader.class);
        artifactGenerator = mock(
                AdminRoomConversationExportArtifactGenerator.class);
        tempManager = mock(ChatExportTempManager.class);
        service = service(snapshotReader);
    }

    @Test
    void validatesTimeRangeBeforeReadingSnapshot() {
        AdminRoomConversationExportRequest request =
                new AdminRoomConversationExportRequest(NOW, NOW);

        assertCode(ChatExportErrorCode.INVALID_EXPORT_TIME_RANGE,
                HttpStatus.BAD_REQUEST,
                false,
                () -> service.prepare("admin-1", "room-1", request));

        verify(snapshotReader, never()).findStable(
                any(), any(), any(), anyInt());
    }

    @Test
    void missingRoomIsNotFound() {
        when(snapshotReader.findStable(
                eq("room-1"), any(), eq(NOW), anyInt()))
                .thenReturn(Optional.empty());

        assertCode(ChatExportErrorCode.ROOM_NOT_FOUND,
                HttpStatus.NOT_FOUND,
                false,
                () -> service.prepare(
                        "admin-1", "room-1", validRequest()));
    }

    @Test
    void unstableSnapshotIsRetryable() {
        when(snapshotReader.findStable(
                eq("room-1"), any(), eq(NOW), anyInt()))
                .thenThrow(new ChatExportSnapshotUnstableException(
                        "unstable"));

        assertCode(ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                HttpStatus.SERVICE_UNAVAILABLE,
                true,
                () -> service.prepare(
                        "admin-1", "room-1", validRequest()));
    }

    @Test
    void preparesArtifactAndPersistsDeliveryCompletion() throws Exception {
        AdminRoomConversationExportSnapshot snapshot = snapshot();
        AdminRoomConversationExportTempWorkspace workspace =
                workspace("export-1");
        when(snapshotReader.findStable(
                eq("room-1"), any(), eq(NOW), eq(3)))
                .thenReturn(Optional.of(snapshot));
        when(tempManager.createAdminConversation(any())).thenReturn(workspace);
        when(artifactGenerator.generate(any(), eq(snapshot), eq(workspace)))
                .thenAnswer(invocation ->
                        new AdminRoomConversationExportArtifact(
                                workspace,
                                workspace.artifactZip(),
                                123,
                                SHA,
                                2,
                                4,
                                2,
                                1,
                                1,
                                NOW));
        when(jobStore.markSucceeded(any(), any())).thenReturn(true);

        try (AdminRoomConversationExportExecution execution =
                service.prepare("admin-1", "room-1", validRequest())) {
            assertThat(execution.artifactPath())
                    .isEqualTo(workspace.artifactZip());
            assertThat(execution.artifactSizeBytes()).isEqualTo(123);
            assertThat(execution.artifactSha256()).isEqualTo(SHA);
            assertThat(execution.markSucceeded()).isTrue();
        }

        verify(jobStore).insertRunning(any(
                AdminRoomConversationExportJob.class));
        verify(jobStore).markSucceeded(any(), any());
        verify(tempManager).cleanupAdminConversationBestEffort(workspace);
    }

    @Test
    void duplicateRunningExportIsConflict() throws Exception {
        when(snapshotReader.findStable(
                eq("room-1"), any(), eq(NOW), anyInt()))
                .thenReturn(Optional.of(snapshot()));
        doThrow(new DuplicateKeyException("running"))
                .when(jobStore)
                .insertRunning(any());

        assertCode(ChatExportErrorCode.CHAT_EXPORT_ALREADY_RUNNING,
                HttpStatus.CONFLICT,
                false,
                () -> service.prepare(
                        "admin-1", "room-1", validRequest()));

        verify(tempManager, never()).createAdminConversation(any());
    }

    private AdminRoomConversationExportService service(
            AdminRoomConversationExportSnapshotReader reader
    ) {
        return new AdminRoomConversationExportService(
                jobStore,
                reader,
                artifactGenerator,
                tempManager,
                new ChatExportConcurrencyGuard(1),
                new ChatExportProperties(),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private AdminRoomConversationExportSnapshot snapshot() {
        return new AdminRoomConversationExportSnapshot(
                mock(ChatExportRoomSnapshot.class),
                new AdminRoomConversationExportRange(
                        NOW.minusSeconds(3_600), NOW),
                4,
                NOW);
    }

    private AdminRoomConversationExportTempWorkspace workspace(
            String exportId
    ) {
        Path directory = Path.of("build", "tmp", exportId);
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

    private AdminRoomConversationExportRequest validRequest() {
        return new AdminRoomConversationExportRequest(
                NOW.minusSeconds(3_600), NOW);
    }

    private void assertCode(
            ChatExportErrorCode code,
            HttpStatus status,
            boolean retryable,
            ThrowingOperation operation
    ) {
        assertThatThrownBy(operation::run)
                .isInstanceOf(ChatExportException.class)
                .satisfies(error -> {
                    ChatExportException export =
                            (ChatExportException) error;
                    assertThat(export.code()).isEqualTo(code);
                    assertThat(export.status()).isEqualTo(status);
                    assertThat(export.retryable()).isEqualTo(retryable);
                });
    }

    @FunctionalInterface
    private interface ThrowingOperation {
        void run() throws Exception;
    }
}
