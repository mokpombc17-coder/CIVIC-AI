package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.stereotype.Service;

import java.util.Objects;
import java.util.Optional;

@Service
public class TaskResultViewDocumentQueryService {

    private final TaskResultViewVerificationService verification;

    public TaskResultViewDocumentQueryService(
            TaskResultViewVerificationService verification
    ) {
        this.verification = Objects.requireNonNull(
                verification, "verification");
    }

    public Optional<TaskResultViewDocument> findByTaskId(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return verification.findByTaskId(taskId)
                .map(TaskResultViewDocumentQueryService::toDocument);
    }

    private static TaskResultViewDocument toDocument(
            VerifiedTaskResultView verified
    ) {
        var manifest = verified.manifest();
        return new TaskResultViewDocument(
                manifest.resultVersion(),
                manifest.schemaVersion(),
                manifest.closedAt(),
                manifest.responseCount(),
                manifest.bodySha256(),
                verified.rendered().content());
    }
}
