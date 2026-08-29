package com.hamcheeze.chat.export;

import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InOrder;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;

import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminRoomConversationExportControllerTest {

    @TempDir
    Path tempDirectory;

    @Test
    void delegatesValidatedRequestAndSetsDownloadHeadersAfterPreparation()
            throws Exception {
        Path artifact = tempDirectory.resolve("artifact.zip");
        Files.write(artifact, new byte[32]);
        AdminRoomConversationExportExecution execution =
                mock(AdminRoomConversationExportExecution.class);
        when(execution.exportId()).thenReturn("export-1");
        when(execution.artifactPath()).thenReturn(artifact);
        when(execution.artifactSizeBytes()).thenReturn(32L);
        when(execution.artifactSha256()).thenReturn("a".repeat(64));
        when(execution.markSucceeded()).thenReturn(true);

        AdminRoomConversationExportService service =
                mock(AdminRoomConversationExportService.class);
        AdminRoomConversationExportRequest request =
                new AdminRoomConversationExportRequest(
                        Instant.parse("2026-08-01T00:00:00Z"),
                        Instant.parse("2026-08-02T00:00:00Z"));
        when(service.prepare("admin-1", "room-1", request))
                .thenReturn(execution);
        AuthenticatedUserIdResolver resolver =
                mock(AuthenticatedUserIdResolver.class);
        Authentication authentication = mock(Authentication.class);
        when(resolver.resolve(authentication)).thenReturn("admin-1");
        AdminRoomConversationExportController controller =
                new AdminRoomConversationExportController(
                        service,
                        resolver);
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(response.getOutputStream()).thenReturn(
                new CollectingServletOutputStream());

        controller.export(
                "room-1",
                request,
                authentication,
                response);

        verify(service).prepare("admin-1", "room-1", request);
        verify(response).setContentType("application/zip");
        verify(response).setHeader(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"room-conversation-export-"
                        + "export-1.zip\"");
        verify(response).setContentLengthLong(32L);
        verify(response).setHeader(HttpHeaders.CACHE_CONTROL,
                "no-store, no-cache, must-revalidate");
        verify(response).setHeader("Pragma", "no-cache");
        verify(response).setHeader("X-Content-Type-Options", "nosniff");
        verify(response).setHeader("X-Export-Id", "export-1");
        verify(response).setHeader("X-Export-SHA256", "a".repeat(64));
        InOrder order = inOrder(response, execution);
        order.verify(response).flushBuffer();
        order.verify(execution).markSucceeded();
        verify(execution).close();
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
