package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationResult;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStateService;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStatus;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/integrations/persona/task-preparations")
class TaskPreparationIntegrationController {

    private final TaskPreparationStateService preparations;

    TaskPreparationIntegrationController(
            TaskPreparationStateService preparations
    ) {
        this.preparations = preparations;
    }

    @PostMapping("/{requestId}/result")
    ResponseEntity<Void> applyResult(
            @PathVariable UUID requestId,
            @RequestBody ResultRequest request
    ) {
        if (!requestId.equals(request.requestId())) {
            throw new IllegalArgumentException(
                    "path and body requestId must match");
        }
        preparations.applyCallback(request.toDomain());
        return ResponseEntity.noContent().build();
    }

    record ResultRequest(
            Integer schemaVersion,
            UUID requestId,
            UUID taskId,
            String contentFingerprint,
            TaskPreparationStatus status,
            Instant preparedAt,
            ErrorRequest error
    ) {

        TaskPreparationResult toDomain() {
            if (schemaVersion == null
                    || requestId == null
                    || taskId == null
                    || status == null) {
                throw new IllegalArgumentException(
                        "schemaVersion, requestId, taskId and status are required");
            }
            return new TaskPreparationResult(
                    schemaVersion,
                    requestId,
                    new TaskId(taskId),
                    contentFingerprint,
                    status,
                    preparedAt,
                    error == null ? null : error.toDomain());
        }
    }

    record ErrorRequest(
            String code,
            String detail,
            Boolean retryable
    ) {

        TaskPreparationResult.Error toDomain() {
            if (retryable == null) {
                throw new IllegalArgumentException(
                        "error.retryable is required");
            }
            return new TaskPreparationResult.Error(
                    code, detail, retryable);
        }
    }
}
