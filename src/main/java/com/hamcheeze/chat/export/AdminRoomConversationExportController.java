package com.hamcheeze.chat.export;

import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
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
@RequestMapping(
        "/api/v1/admin/rooms/{roomId}/conversation-exports")
public final class AdminRoomConversationExportController {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            AdminRoomConversationExportController.class);

    private final AdminRoomConversationExportService service;
    private final AuthenticatedUserIdResolver userIdResolver;

    public AdminRoomConversationExportController(
            AdminRoomConversationExportService service,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.service = service;
        this.userIdResolver = userIdResolver;
    }

    @PostMapping
    public void export(
            @PathVariable String roomId,
            @Valid @RequestBody AdminRoomConversationExportRequest request,
            Authentication authentication,
            HttpServletResponse response
    ) throws IOException {
        String adminId = userIdResolver.resolve(authentication);
        try (AdminRoomConversationExportExecution execution =
                service.prepare(adminId, roomId, request)) {
            String exportId = execution.exportId();
            response.setStatus(HttpServletResponse.SC_OK);
            response.setContentType("application/zip");
            response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"room-conversation-export-"
                            + exportId + ".zip\"");
            response.setContentLengthLong(execution.artifactSizeBytes());
            response.setHeader(HttpHeaders.CACHE_CONTROL,
                    "no-store, no-cache, must-revalidate");
            response.setHeader("Pragma", "no-cache");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("X-Export-Id", exportId);
            response.setHeader(
                    "X-Export-SHA256",
                    execution.artifactSha256());

            try (InputStream input = Files.newInputStream(
                    execution.artifactPath())) {
                input.transferTo(response.getOutputStream());
                response.flushBuffer();
            } catch (IOException exception) {
                execution.markFailedBestEffort(
                        ChatExportFailureCode.DELIVERY_FAILED);
                LOGGER.warn("Admin room conversation export delivery failed");
                if (!response.isCommitted()) {
                    throw new ChatExportException(
                            ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                            HttpStatus.SERVICE_UNAVAILABLE,
                            true,
                            "Admin room conversation export delivery failed",
                            exception);
                }
                return;
            }

            try {
                if (execution.markSucceeded()) {
                    return;
                }
            } catch (RuntimeException exception) {
                LOGGER.error("Admin room conversation export success "
                        + "transition failed after delivery");
            }
            execution.markFailedBestEffort(
                    ChatExportFailureCode.SUCCESS_TRANSITION_FAILED);
            LOGGER.error("Admin room conversation export success "
                    + "transition failed after delivery");
        }
    }
}
