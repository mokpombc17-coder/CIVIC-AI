package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1;

import java.util.Objects;

public interface TaskResultForLlmRenderer {

    RenderedTaskResultForLlm render(TaskResultForLlmV1 export);

    record RenderedTaskResultForLlm(
            String content,
            String bodySha256
    ) {

        public RenderedTaskResultForLlm {
            Objects.requireNonNull(content, "content");
            Objects.requireNonNull(bodySha256, "bodySha256");
        }
    }
}
