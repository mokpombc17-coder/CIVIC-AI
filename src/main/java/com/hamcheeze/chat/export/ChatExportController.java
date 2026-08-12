package com.hamcheeze.chat.export;

import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

@RestController
@RequestMapping("/api/v1/admin/rooms/{roomId}/exports")
public final class ChatExportController {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            ChatExportController.class);

    private final ChatExportService service;
    private final AuthenticatedUserIdResolver userIdResolver;

    public ChatExportController(
            ChatExportService service,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.service = service;
        this.userIdResolver = userIdResolver;
    }

    @PostMapping
    public void export(
            @PathVariable String roomId,
            @Valid @RequestBody ChatExportRequest request,
            Authentication authentication,
            HttpServletResponse response
    ) throws IOException {
        String adminId = userIdResolver.resolve(authentication);
        try (ChatExportExecution execution = service.prepare(
                adminId,
                roomId,
                request.mode())) {
            ChatExportArtifact artifact = execution.artifact();
            String exportId = execution.job().exportId();
            response.setStatus(HttpServletResponse.SC_OK);
            response.setContentType("application/zip");
            response.setHeader(
                    HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"chat-export-"
                            + exportId
                            + ".zip\"");
            response.setContentLengthLong(artifact.sizeBytes());
            response.setHeader(
                    HttpHeaders.CACHE_CONTROL,
                    "no-store, no-cache, must-revalidate");
            response.setHeader("Pragma", "no-cache");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("X-Export-Id", exportId);
            response.setHeader("X-Export-SHA256", artifact.sha256());

            try (InputStream input = Files.newInputStream(artifact.path())) {
                input.transferTo(response.getOutputStream());
                response.flushBuffer();
            } catch (IOException exception) {
                execution.markFailedBestEffort(
                        ChatExportFailureCode.DELIVERY_FAILED);
                LOGGER.warn("Chat export delivery failed");
                if (!response.isCommitted()) {
                    throw new ChatExportException(
                            ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                            org.springframework.http.HttpStatus
                                    .SERVICE_UNAVAILABLE,
                            true,
                            "Chat export delivery is unavailable",
                            exception);
                }
                return;
            }

            try {
                if (execution.markSucceeded()) {
                    return;
                }
            } catch (RuntimeException exception) {
                LOGGER.error(
                        "Chat export success transition failed after delivery",
                        exception);
            }
            execution.markFailedBestEffort(
                    ChatExportFailureCode.SUCCESS_TRANSITION_FAILED);
            LOGGER.error(
                    "Chat export success transition failed after delivery");
        }
    }
}
