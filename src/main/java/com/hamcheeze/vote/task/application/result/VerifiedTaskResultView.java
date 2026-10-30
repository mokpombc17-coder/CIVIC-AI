package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;

import java.util.Objects;

public record VerifiedTaskResultView(
        TaskResultManifest manifest,
        TaskResultViewV1 view,
        RenderedTaskResultView rendered
) {

    public VerifiedTaskResultView {
        Objects.requireNonNull(manifest, "manifest");
        Objects.requireNonNull(view, "view");
        Objects.requireNonNull(rendered, "rendered");
    }
}
