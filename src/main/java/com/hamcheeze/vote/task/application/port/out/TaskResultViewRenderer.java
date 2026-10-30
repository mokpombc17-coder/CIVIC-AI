package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.result.TaskResultViewV1;

import java.util.Objects;

public interface TaskResultViewRenderer {

    RenderedTaskResultView render(TaskResultViewV1 view);

    record RenderedTaskResultView(
            String content,
            String bodySha256
    ) {

        public RenderedTaskResultView {
            Objects.requireNonNull(content, "content");
            Objects.requireNonNull(bodySha256, "bodySha256");
        }
    }
}
