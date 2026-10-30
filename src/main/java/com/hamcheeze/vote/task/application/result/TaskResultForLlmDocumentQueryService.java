package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.port.out.TaskResultForLlmRenderer;
import com.hamcheeze.vote.task.application.port.out.TaskResultForLlmRenderer.RenderedTaskResultForLlm;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.stereotype.Service;

import java.util.Objects;
import java.util.Optional;

@Service
public class TaskResultForLlmDocumentQueryService {

    private final TaskResultViewVerificationService verification;
    private final TaskResultForLlmV1Assembler assembler;
    private final TaskResultForLlmRenderer renderer;

    public TaskResultForLlmDocumentQueryService(
            TaskResultViewVerificationService verification,
            TaskResultForLlmV1Assembler assembler,
            TaskResultForLlmRenderer renderer
    ) {
        this.verification = Objects.requireNonNull(
                verification, "verification");
        this.assembler = Objects.requireNonNull(assembler, "assembler");
        this.renderer = Objects.requireNonNull(renderer, "renderer");
    }

    public Optional<TaskResultForLlmDocument> findByTaskId(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return verification.findByTaskId(taskId).map(verified -> {
            TaskResultForLlmV1 export = assembler.assemble(taskId, verified);
            RenderedTaskResultForLlm rendered = renderer.render(export);
            return new TaskResultForLlmDocument(
                    export.task().title(),
                    TaskResultForLlmV1.SCHEMA_VERSION,
                    export.resultVersion(),
                    export.responses().size(),
                    export.sourceBodySha256(),
                    rendered.bodySha256(),
                    rendered.content());
        });
    }
}
