package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.result.TaskResultSummaryQueryService;
import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/tasks")
final class TaskResultSummaryController {

    private final TaskResultSummaryQueryService summaries;

    TaskResultSummaryController(TaskResultSummaryQueryService summaries) {
        this.summaries = Objects.requireNonNull(summaries, "summaries");
    }

    @GetMapping("/{taskId}/result-summary")
    TaskResultSummaryV1 findByTaskId(@PathVariable UUID taskId) {
        return summaries.findByTaskId(new TaskId(taskId))
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_RESULT_SUMMARY_NOT_FOUND",
                        "The finalized task result summary does not exist."));
    }
}
