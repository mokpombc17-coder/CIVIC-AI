package com.hamcheeze.chat.export;

import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.core.Authentication;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatExportControllerTest {

    private static final Instant NOW =
            Instant.parse("2026-08-11T03:00:00Z");

    @TempDir
    Path tempDirectory;

    @Test
    void failingOutputStreamMarksDeliveryFailedAndReleasesResources()
            throws Exception {
        Fixture fixture = fixture();
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(response.getOutputStream()).thenReturn(
                new FailingServletOutputStream(3));
        when(response.isCommitted()).thenReturn(true);

        assertThatCode(() -> fixture.controller().export(
                "room-1",
                new ChatExportRequest(ChatExportMode.FULL),
                mock(Authentication.class),
                response)).doesNotThrowAnyException();

        verify(fixture.jobStore()).markFailed(
                "export-1",
                ChatExportFailureCode.DELIVERY_FAILED,
                NOW);
        verify(fixture.tempManager()).cleanupBestEffort(
                fixture.execution().artifact().workspace());
        assertThatCode(() -> fixture.guard().tryAcquire().close())
                .doesNotThrowAnyException();
    }

    @Test
    void unexpectedHeaderRuntimeStillClosesExecution() throws Exception {
        Fixture fixture = fixture();
        HttpServletResponse response = mock(HttpServletResponse.class);
        doThrow(new IllegalStateException("response failed"))
                .when(response)
                .setHeader(anyString(), anyString());

        assertThatThrownBy(() -> fixture.controller().export(
                "room-1",
                new ChatExportRequest(ChatExportMode.FULL),
                mock(Authentication.class),
                response))
                .isInstanceOf(IllegalStateException.class);

        verify(fixture.jobStore()).markFailed(
                "export-1",
                ChatExportFailureCode.DELIVERY_FAILED,
                NOW);
        verify(fixture.tempManager()).cleanupBestEffort(
                fixture.execution().artifact().workspace());
        assertThatCode(() -> fixture.guard().tryAcquire().close())
                .doesNotThrowAnyException();
    }

    @Test
    void successTransitionFailureDoesNotCreateCheckpoint()
            throws Exception {
        Fixture fixture = fixture();
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(response.getOutputStream()).thenReturn(
                new CollectingServletOutputStream());
        when(fixture.jobStore().markSucceeded(anyString(), any()))
                .thenThrow(new IllegalStateException("store failed"));

        assertThatCode(() -> fixture.controller().export(
                "room-1",
                new ChatExportRequest(ChatExportMode.FULL),
                mock(Authentication.class),
                response)).doesNotThrowAnyException();

        verify(fixture.jobStore()).markFailed(
                "export-1",
                ChatExportFailureCode.SUCCESS_TRANSITION_FAILED,
                NOW);
        verify(fixture.tempManager()).cleanupBestEffort(
                fixture.execution().artifact().workspace());
        assertThatCode(() -> fixture.guard().tryAcquire().close())
                .doesNotThrowAnyException();
    }

    private Fixture fixture() throws Exception {
        Path artifactPath = tempDirectory.resolve("artifact.zip");
        Files.write(artifactPath, new byte[32]);
        ChatExportTempWorkspace workspace = new ChatExportTempWorkspace(
                "11111111-1111-1111-1111-111111111111",
                tempDirectory,
                tempDirectory.resolve("room.json"),
                tempDirectory.resolve("participants.jsonl"),
                tempDirectory.resolve("events.jsonl"),
                tempDirectory.resolve("transcript.html"),
                tempDirectory.resolve("manifest.json"),
                tempDirectory.resolve("artifact.part"),
                artifactPath);
        ChatExportArtifact artifact = new ChatExportArtifact(
                workspace,
                artifactPath,
                32,
                "a".repeat(64),
                1,
                1,
                0,
                0,
                1,
                NOW);
        ChatExportJob job = ChatExportJob.running(
                "export-1",
                "room-1",
                ChatExportMode.FULL,
                null,
                0,
                1,
                "admin-1",
                NOW);
        ChatExportJobStore jobStore = mock(ChatExportJobStore.class);
        when(jobStore.markFailed(anyString(), any(), any()))
                .thenReturn(true);
        ChatExportTempManager tempManager = mock(ChatExportTempManager.class);
        ChatExportConcurrencyGuard guard = new ChatExportConcurrencyGuard(1);
        ChatExportMetrics metrics = new ChatExportMetrics(
                new SimpleMeterRegistry());
        ChatExportExecution execution = new ChatExportExecution(
                job,
                artifact,
                jobStore,
                tempManager,
                guard.tryAcquire(),
                Clock.fixed(NOW, ZoneOffset.UTC),
                metrics,
                metrics.start(ChatExportMode.FULL));
        ChatExportService service = mock(ChatExportService.class);
        when(service.prepare(anyString(), anyString(), any()))
                .thenReturn(execution);
        AuthenticatedUserIdResolver resolver = mock(
                AuthenticatedUserIdResolver.class);
        when(resolver.resolve(any())).thenReturn("admin-1");
        return new Fixture(
                new ChatExportController(service, resolver),
                execution,
                jobStore,
                tempManager,
                guard);
    }

    private record Fixture(
            ChatExportController controller,
            ChatExportExecution execution,
            ChatExportJobStore jobStore,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard guard
    ) {
    }

    private static final class FailingServletOutputStream
            extends ServletOutputStream {

        private int remaining;

        private FailingServletOutputStream(int remaining) {
            this.remaining = remaining;
        }

        @Override
        public void write(int value) throws IOException {
            if (remaining-- <= 0) {
                throw new IOException("delivery failed");
            }
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setWriteListener(WriteListener listener) {
        }
    }

    private static final class CollectingServletOutputStream
            extends ServletOutputStream {

        private final ByteArrayOutputStream output =
                new ByteArrayOutputStream();

        @Override
        public void write(int value) {
            output.write(value);
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setWriteListener(WriteListener listener) {
        }
    }
}
