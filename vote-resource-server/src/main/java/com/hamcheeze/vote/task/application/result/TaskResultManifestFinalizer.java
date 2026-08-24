package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultResponseReader;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.task.Task;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
public class TaskResultManifestFinalizer {

    private final TaskResultResponseReader responses;
    private final TaskResultViewV1Assembler assembler;
    private final TaskResultViewRenderer renderer;
    private final TaskResultManifestRepository manifests;

    public TaskResultManifestFinalizer(
            TaskResultResponseReader responses,
            TaskResultViewV1Assembler assembler,
            TaskResultViewRenderer renderer,
            TaskResultManifestRepository manifests
    ) {
        this.responses = Objects.requireNonNull(responses, "responses");
        this.assembler = Objects.requireNonNull(assembler, "assembler");
        this.renderer = Objects.requireNonNull(renderer, "renderer");
        this.manifests = Objects.requireNonNull(manifests, "manifests");
    }

    public TaskResultManifest finalizeResult(Task task) {
        Objects.requireNonNull(task, "task");
        TaskResultViewV1 view = assembler.assemble(
                task,
                responses.findByTaskId(task.id()),
                TaskResultViewV1.RESULT_VERSION);
        RenderedTaskResultView rendered = renderer.render(view);
        return manifests.insert(new TaskResultManifest(
                task.id(),
                view.resultVersion(),
                TaskResultViewV1.SCHEMA_VERSION,
                task.closedAt(),
                view.responses().size(),
                rendered.bodySha256(),
                task.closedAt()));
    }
}
