package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.query.TaskProgressResponsesQueryService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/tasks")
final class TaskProgressResponsesController {

    private final TaskProgressResponsesQueryService responses;

    TaskProgressResponsesController(
            TaskProgressResponsesQueryService responses
    ) {
        this.responses = Objects.requireNonNull(responses, "responses");
    }

    @GetMapping("/{taskId}/progress-responses")
    ResponseEntity<TaskApiModels.AdminTaskProgressResponsesResponse>
    findByTaskId(
            @PathVariable UUID taskId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "100") int limit
    ) {
        var response = responses.findByTaskId(
                        new TaskId(taskId), cursor, limit)
                .map(TaskApiModels.AdminTaskProgressResponsesResponse::from)
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_NOT_FOUND", "The task does not exist."));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(response);
    }
}
