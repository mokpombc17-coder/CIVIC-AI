package com.hamcheeze.chat.export;

import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatExportExecutionTest {

    private static final Instant NOW =
            Instant.parse("2026-08-11T03:00:00Z");

    @Test
    void closeWithoutTerminalTransitionMarksDeliveryFailedAndReleasesPermit() {
        ChatExportJobStore jobStore = mock(ChatExportJobStore.class);
        ChatExportTempManager tempManager = mock(ChatExportTempManager.class);
        ChatExportConcurrencyGuard guard = new ChatExportConcurrencyGuard(1);
        when(jobStore.markFailed(any(), any(), any())).thenReturn(true);
        ChatExportExecution execution = execution(
                jobStore,
                tempManager,
                guard.tryAcquire());

        execution.close();

        verify(jobStore).markFailed(
                "export-1",
                ChatExportFailureCode.DELIVERY_FAILED,
                NOW);
        verify(tempManager).cleanupBestEffort(
                execution.artifact().workspace());
        assertThat(guard.tryAcquire()).isNotNull();
    }

    @Test
    void failedMetadataTransitionIsRetriedByClose() {
        ChatExportJobStore jobStore = mock(ChatExportJobStore.class);
        ChatExportTempManager tempManager = mock(ChatExportTempManager.class);
        ChatExportConcurrencyGuard guard = new ChatExportConcurrencyGuard(1);
        when(jobStore.markFailed(any(), any(), any()))
                .thenThrow(new IllegalStateException("storage unavailable"))
                .thenReturn(true);
        ChatExportExecution execution = execution(
                jobStore,
                tempManager,
                guard.tryAcquire());

        execution.markFailedBestEffort(
                ChatExportFailureCode.DELIVERY_FAILED);
        execution.close();

        verify(jobStore, times(2)).markFailed(
                "export-1",
                ChatExportFailureCode.DELIVERY_FAILED,
                NOW);
        assertThat(guard.tryAcquire()).isNotNull();
    }

    @Test
    void cleanupAndMetricFailuresDoNotChangeSuccessOrPermitRelease() {
        ChatExportJobStore jobStore = mock(ChatExportJobStore.class);
        ChatExportTempManager tempManager = mock(ChatExportTempManager.class);
        ChatExportConcurrencyGuard guard = new ChatExportConcurrencyGuard(1);
        when(jobStore.markSucceeded(eq("export-1"), any()))
                .thenReturn(true);
        doThrow(new IllegalStateException("cleanup failed"))
                .when(tempManager)
                .cleanupBestEffort(any());
        ChatExportExecution execution = execution(
                jobStore,
                tempManager,
                guard.tryAcquire());

        assertThat(execution.markSucceeded()).isTrue();
        assertThatCode(execution::close).doesNotThrowAnyException();
        assertThat(guard.tryAcquire()).isNotNull();
    }

    private ChatExportExecution execution(
            ChatExportJobStore jobStore,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard.Permit permit
    ) {
        ChatExportJob job = ChatExportJob.running(
                "export-1",
                "room-1",
                ChatExportMode.FULL,
                null,
                0,
                1,
                "admin-1",
                NOW);
        ChatExportTempWorkspace workspace = new ChatExportTempWorkspace(
                "11111111-1111-1111-1111-111111111111",
                Path.of("workspace"),
                Path.of("room.json"),
                Path.of("participants.jsonl"),
                Path.of("events.jsonl"),
                Path.of("transcript.html"),
                Path.of("manifest.json"),
                Path.of("artifact.part"),
                Path.of("artifact.zip"));
        ChatExportArtifact artifact = new ChatExportArtifact(
                workspace,
                workspace.artifactZip(),
                100,
                "a".repeat(64),
                1,
                1,
                0,
                0,
                1,
                NOW);
        ChatExportMetrics metrics = new ChatExportMetrics(
                mock(MeterRegistry.class));
        ChatExportMetrics.Attempt attempt = metrics.start(
                ChatExportMode.FULL);
        return new ChatExportExecution(
                job,
                artifact,
                jobStore,
                tempManager,
                permit,
                Clock.fixed(NOW, ZoneOffset.UTC),
                metrics,
                attempt);
    }
}
