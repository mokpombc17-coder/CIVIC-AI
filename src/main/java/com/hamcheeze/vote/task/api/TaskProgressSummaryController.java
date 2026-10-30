package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.query.TaskProgressSummaryQueryService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/tasks")
final class TaskProgressSummaryController {

    private final TaskProgressSummaryQueryService summaries;

    TaskProgressSummaryController(
            TaskProgressSummaryQueryService summaries
    ) {
        this.summaries = Objects.requireNonNull(summaries, "summaries");
    }

    @GetMapping("/{taskId}/progress-summary")
    ResponseEntity<TaskApiModels.AdminTaskProgressSummaryResponse>
    findByTaskId(@PathVariable UUID taskId) {
        var response = summaries.findByTaskId(new TaskId(taskId))
                .map(TaskApiModels.AdminTaskProgressSummaryResponse::from)
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_NOT_FOUND", "The task does not exist."));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(response);
    }
}
