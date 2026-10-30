package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.stereotype.Service;

import java.util.Objects;
import java.util.Optional;

@Service
public class TaskResultSummaryQueryService {

    private final TaskResultViewVerificationService verification;
    private final TaskResultSummaryAssembler assembler;

    public TaskResultSummaryQueryService(
            TaskResultViewVerificationService verification,
            TaskResultSummaryAssembler assembler
    ) {
        this.verification = Objects.requireNonNull(
                verification, "verification");
        this.assembler = Objects.requireNonNull(assembler, "assembler");
    }

    public Optional<TaskResultSummaryV1> findByTaskId(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return verification.findByTaskId(taskId)
                .map(VerifiedTaskResultView::view)
                .map(assembler::assemble);
    }
}
