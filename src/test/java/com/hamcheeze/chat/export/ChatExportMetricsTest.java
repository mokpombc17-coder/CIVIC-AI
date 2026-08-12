package com.hamcheeze.chat.export;

import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;

class ChatExportMetricsTest {

    @Test
    void registryFailuresAreIsolatedFromEveryOutcome() {
        ChatExportMetrics metrics = new ChatExportMetrics(
                mock(MeterRegistry.class));
        ChatExportArtifact artifact = new ChatExportArtifact(
                workspace(),
                Path.of("artifact.zip"),
                10,
                "a".repeat(64),
                1,
                1,
                0,
                0,
                1,
                Instant.parse("2026-08-11T03:00:00Z"));

        ChatExportMetrics.Attempt succeeded = metrics.start(
                ChatExportMode.FULL);
        assertThatCode(() -> metrics.succeeded(succeeded, artifact))
                .doesNotThrowAnyException();

        ChatExportMetrics.Attempt failed = metrics.start(
                ChatExportMode.INCREMENTAL);
        assertThatCode(() -> metrics.failed(failed, "TEST"))
                .doesNotThrowAnyException();
        assertThatCode(() -> metrics.deliveryFailed(ChatExportMode.FULL))
                .doesNotThrowAnyException();
    }

    private ChatExportTempWorkspace workspace() {
        return new ChatExportTempWorkspace(
                "11111111-1111-1111-1111-111111111111",
                Path.of("workspace"),
                Path.of("room.json"),
                Path.of("participants.jsonl"),
                Path.of("events.jsonl"),
                Path.of("transcript.html"),
                Path.of("manifest.json"),
                Path.of("artifact.part"),
                Path.of("artifact.zip"));
    }
}
