package com.hamcheeze.chat.export;

import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

@RestController
@RequestMapping("/api/v1/research/rooms/{roomId}/exports")
public final class ResearchChatExportController {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            ResearchChatExportController.class);

    private final ResearchChatExportService service;
    private final AuthenticatedUserIdResolver userIdResolver;

    public ResearchChatExportController(
            ResearchChatExportService service,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.service = service;
        this.userIdResolver = userIdResolver;
    }

    @PostMapping
    public void export(
            @PathVariable String roomId,
            Authentication authentication,
            HttpServletResponse response
    ) throws IOException {
        String researcherId = userIdResolver.resolve(authentication);
        try (ResearchChatExportExecution execution = service.prepare(
                researcherId,
                roomId)) {
            ResearchChatExportArtifact artifact = execution.artifact();
            String exportId = execution.job().exportId();
            response.setStatus(HttpServletResponse.SC_OK);
            response.setContentType("application/zip");
            response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"research-room-export-"
                            + exportId + ".zip\"");
            response.setContentLengthLong(artifact.sizeBytes());
            response.setHeader(HttpHeaders.CACHE_CONTROL,
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
                LOGGER.warn("Research chat export delivery failed");
                if (!response.isCommitted()) {
                    throw new ChatExportException(
                            ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                            HttpStatus.SERVICE_UNAVAILABLE,
                            true,
                            "Research export delivery failed",
                            exception);
                }
                return;
            }

            try {
                if (execution.markSucceeded()) {
                    return;
                }
            } catch (RuntimeException exception) {
                LOGGER.error("Research export success transition failed "
                        + "after delivery");
            }
            execution.markFailedBestEffort(
                    ChatExportFailureCode.SUCCESS_TRANSITION_FAILED);
            LOGGER.error("Research export success transition failed "
                    + "after delivery");
        }
    }
}
