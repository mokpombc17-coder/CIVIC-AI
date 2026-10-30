package com.hamcheeze.chat.export;

import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InOrder;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ResearchChatExportControllerTest {

    private static final Instant NOW =
            Instant.parse("2026-08-24T03:00:04Z");

    @TempDir
    Path tempDirectory;

    @Test
    void flushesWholeBodyBeforeSuccessAndSetsExactHeaders()
            throws Exception {
        Fixture fixture = fixture();
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(response.getOutputStream()).thenReturn(
                new CollectingServletOutputStream());
        when(fixture.store().markSucceeded(eq("export-1"), any()))
                .thenReturn(true);

        fixture.controller().export(
                "room-1", mock(Authentication.class), response);

        verify(response).setContentType("application/zip");
        verify(response).setHeader(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"research-room-export-export-1.zip\"");
        verify(response).setContentLengthLong(32);
        verify(response).setHeader(HttpHeaders.CACHE_CONTROL,
                "no-store, no-cache, must-revalidate");
        verify(response).setHeader("Pragma", "no-cache");
        verify(response).setHeader("X-Content-Type-Options", "nosniff");
        verify(response).setHeader("X-Export-Id", "export-1");
        verify(response).setHeader("X-Export-SHA256", "a".repeat(64));
        InOrder order = inOrder(response, fixture.store());
        order.verify(response).flushBuffer();
        order.verify(fixture.store()).markSucceeded(
                eq("export-1"), any());
        verify(fixture.tempManager()).cleanupResearchBestEffort(
                fixture.workspace());
        assertThatCode(() -> fixture.guard().tryAcquire().close())
                .doesNotThrowAnyException();
    }

    @Test
    void clientDisconnectMarksDeliveryFailedAndReleasesResources()
            throws Exception {
        Fixture fixture = fixture();
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(response.getOutputStream()).thenReturn(
                new FailingServletOutputStream(3));
        when(response.isCommitted()).thenReturn(true);
        when(fixture.store().markFailed(anyString(), any(), any()))
                .thenReturn(true);

        assertThatCode(() -> fixture.controller().export(
                "room-1", mock(Authentication.class), response))
                .doesNotThrowAnyException();

        verify(fixture.store()).markFailed(
                "export-1", ChatExportFailureCode.DELIVERY_FAILED, NOW);
        verify(fixture.tempManager()).cleanupResearchBestEffort(
                fixture.workspace());
        assertThatCode(() -> fixture.guard().tryAcquire().close())
                .doesNotThrowAnyException();
    }

    private Fixture fixture() throws Exception {
        Path artifactPath = tempDirectory.resolve("artifact.zip");
        Files.write(artifactPath, new byte[32]);
        ResearchChatExportTempWorkspace workspace =
                new ResearchChatExportTempWorkspace(
                        "11111111-1111-1111-1111-111111111111",
                        tempDirectory,
                        tempDirectory.resolve("messages.jsonl"),
                        tempDirectory.resolve("message_changes.jsonl"),
                        tempDirectory.resolve("transcript.html"),
                        tempDirectory.resolve("metadata.json"),
                        tempDirectory.resolve("artifact.part"),
                        artifactPath);
        ResearchChatExportArtifact artifact =
                new ResearchChatExportArtifact(
                        workspace, artifactPath, 32, "a".repeat(64),
                        1, 1, 1, 0, 0, NOW);
        ResearchChatExportJob job = ResearchChatExportJob.running(
                "export-1", "room-1", 1, "researcher-1", NOW);
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
        ResearchChatExportService service =
                mock(ResearchChatExportService.class);
        when(service.prepare(anyString(), anyString()))
                .thenReturn(execution);
        AuthenticatedUserIdResolver resolver =
                mock(AuthenticatedUserIdResolver.class);
        when(resolver.resolve(any())).thenReturn("researcher-1");
        return new Fixture(
                new ResearchChatExportController(service, resolver),
                store, tempManager, guard, workspace);
    }

    private record Fixture(
            ResearchChatExportController controller,
            ResearchChatExportJobStore store,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard guard,
            ResearchChatExportTempWorkspace workspace
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
