package com.hamcheeze.chat.export;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ResearchChatExportExecutionTest {

    private static final Instant NOW =
            Instant.parse("2026-08-24T03:00:04Z");

    @TempDir
    Path tempDirectory;

    @Test
    void succeedsOnlyAfterExplicitDeliveryCompletion() {
        Fixture fixture = fixture();
        when(fixture.store().markSucceeded(eq("export-1"), any()))
                .thenReturn(true);

        assertThat(fixture.execution().markSucceeded()).isTrue();
        fixture.execution().close();

        verify(fixture.store()).markSucceeded(eq("export-1"), any());
        verify(fixture.store(), times(0)).markFailed(any(), any(), any());
        verify(fixture.tempManager()).cleanupResearchBestEffort(
                fixture.workspace());
        assertThatCode(() -> fixture.guard().tryAcquire().close())
                .doesNotThrowAnyException();
    }

    @Test
    void closeWithoutTerminalOutcomeMarksDeliveryFailedAndCleans() {
        Fixture fixture = fixture();
        when(fixture.store().markFailed(any(), any(), any()))
                .thenReturn(true);

        fixture.execution().close();

        verify(fixture.store()).markFailed(
                "export-1", ChatExportFailureCode.DELIVERY_FAILED, NOW);
        verify(fixture.tempManager()).cleanupResearchBestEffort(
                fixture.workspace());
        assertThat(fixture.guard().tryAcquire()).isNotNull();
    }

    @Test
    void failedSuccessTransitionCanBePersistedAsDedicatedFailure() {
        Fixture fixture = fixture();
        doThrow(new IllegalStateException("store unavailable"))
                .when(fixture.store()).markSucceeded(any(), any());
        when(fixture.store().markFailed(any(), any(), any()))
                .thenReturn(true);

        assertThatThrownBy(fixture.execution()::markSucceeded)
                .isInstanceOf(IllegalStateException.class);
        fixture.execution().markFailedBestEffort(
                ChatExportFailureCode.SUCCESS_TRANSITION_FAILED);
        fixture.execution().close();

        verify(fixture.store()).markFailed(
                "export-1",
                ChatExportFailureCode.SUCCESS_TRANSITION_FAILED,
                NOW);
        verify(fixture.tempManager()).cleanupResearchBestEffort(
                fixture.workspace());
        assertThat(fixture.guard().tryAcquire()).isNotNull();
    }

    private Fixture fixture() {
        ResearchChatExportTempWorkspace workspace =
                new ResearchChatExportTempWorkspace(
                        "11111111-1111-1111-1111-111111111111",
                        tempDirectory,
                        tempDirectory.resolve("messages.jsonl"),
                        tempDirectory.resolve("message_changes.jsonl"),
                        tempDirectory.resolve("transcript.html"),
                        tempDirectory.resolve("metadata.json"),
                        tempDirectory.resolve("artifact.part"),
                        tempDirectory.resolve("artifact.zip"));
        ResearchChatExportArtifact artifact =
                new ResearchChatExportArtifact(
                        workspace, workspace.artifactZip(), 128,
                        "a".repeat(64), 2, 4, 2, 1, 1, NOW);
        ResearchChatExportJob job = ResearchChatExportJob.running(
                "export-1", "room-1", 4, "researcher-1", NOW);
        ResearchChatExportJobStore store =
                mock(ResearchChatExportJobStore.class);
        ChatExportTempManager tempManager =
                mock(ChatExportTempManager.class);
        ChatExportConcurrencyGuard guard =
                new ChatExportConcurrencyGuard(1);
        ResearchChatExportMetrics metrics = new ResearchChatExportMetrics(
                new SimpleMeterRegistry());
        ResearchChatExportExecution execution =
                new ResearchChatExportExecution(
                        job, artifact, store, tempManager,
                        guard.tryAcquire(),
                        Clock.fixed(NOW, ZoneOffset.UTC),
                        metrics, metrics.start());
        return new Fixture(
                execution, store, tempManager, guard, workspace);
    }

    private record Fixture(
            ResearchChatExportExecution execution,
            ResearchChatExportJobStore store,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard guard,
            ResearchChatExportTempWorkspace workspace
    ) {
    }
}
