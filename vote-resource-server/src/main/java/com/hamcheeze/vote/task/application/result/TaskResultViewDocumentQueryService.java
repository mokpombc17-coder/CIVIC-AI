package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.Optional;

@Service
public class TaskResultViewDocumentQueryService {

    private final TaskResultManifestRepository manifests;
    private final TaskResultViewQueryService views;
    private final TaskResultViewRenderer renderer;

    public TaskResultViewDocumentQueryService(
            TaskResultManifestRepository manifests,
            TaskResultViewQueryService views,
            TaskResultViewRenderer renderer
    ) {
        this.manifests = Objects.requireNonNull(manifests, "manifests");
        this.views = Objects.requireNonNull(views, "views");
        this.renderer = Objects.requireNonNull(renderer, "renderer");
    }

    @Transactional(readOnly = true)
    public Optional<TaskResultViewDocument> findByTaskId(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return manifests.findByTaskId(taskId)
                .map(manifest -> assemble(taskId, manifest));
    }

    private TaskResultViewDocument assemble(
            TaskId taskId,
            TaskResultManifest manifest
    ) {
        if (!taskId.equals(manifest.taskId())) {
            throw integrity(taskId, "manifest taskId does not match");
        }
        TaskResultViewV1 view;
        try {
            view = views.findByTaskId(taskId)
                    .orElseThrow(() -> integrity(
                            taskId, "finalized task does not exist"));
        } catch (TaskResultViewIntegrityException exception) {
            throw exception;
        } catch (IllegalArgumentException | IllegalStateException exception) {
            throw integrity(taskId, "result view cannot be assembled");
        }
        verifyMetadata(taskId, manifest, view);
        RenderedTaskResultView rendered;
        try {
            rendered = renderer.render(view);
        } catch (IllegalArgumentException | IllegalStateException exception) {
            throw integrity(taskId, "result view cannot be rendered");
        }
        verifyBody(taskId, manifest, rendered);
        return new TaskResultViewDocument(
                manifest.resultVersion(),
                manifest.schemaVersion(),
                manifest.closedAt(),
                manifest.responseCount(),
                manifest.bodySha256(),
                rendered.content());
    }

    private static void verifyMetadata(
            TaskId taskId,
            TaskResultManifest manifest,
            TaskResultViewV1 view
    ) {
        if (manifest.resultVersion() != view.resultVersion()) {
            throw integrity(taskId, "resultVersion does not match");
        }
        if (!manifest.schemaVersion().equals(
                TaskResultViewV1.SCHEMA_VERSION)) {
            throw integrity(taskId, "schemaVersion is unsupported");
        }
        if (!manifest.closedAt().equals(view.closedAt())) {
            throw integrity(taskId, "closedAt does not match");
        }
        if (manifest.responseCount() != view.responses().size()) {
            throw integrity(taskId, "responseCount does not match");
        }
    }

    private static void verifyBody(
            TaskId taskId,
            TaskResultManifest manifest,
            RenderedTaskResultView rendered
    ) {
        if (!manifest.bodySha256().equals(rendered.bodySha256())) {
            throw integrity(taskId, "bodySha256 does not match");
        }
    }

    private static TaskResultViewIntegrityException integrity(
            TaskId taskId,
            String reason
    ) {
        return new TaskResultViewIntegrityException(taskId, reason);
    }
}
