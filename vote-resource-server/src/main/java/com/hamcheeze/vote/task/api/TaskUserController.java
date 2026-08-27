package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.task.application.prediction.EnsureTaskPredictionResult;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionService;
import com.hamcheeze.vote.task.application.query.CompletedTaskQueryService;
import com.hamcheeze.vote.task.application.query.TaskPredictionQueryService;
import com.hamcheeze.vote.task.application.query.UserTaskQueryService;
import com.hamcheeze.vote.task.application.result.MyTaskResultQueryService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/me/tasks")
final class TaskUserController {

    private final AuthenticatedUserIdResolver userIds;
    private final UserTaskQueryService tasks;
    private final CompletedTaskQueryService completedTasks;
    private final MyTaskResultQueryService taskResults;
    private final TaskPredictionService predictions;
    private final TaskPredictionQueryService predictionQueries;

    TaskUserController(
            AuthenticatedUserIdResolver userIds,
            UserTaskQueryService tasks,
            CompletedTaskQueryService completedTasks,
            MyTaskResultQueryService taskResults,
            TaskPredictionService predictions,
            TaskPredictionQueryService predictionQueries
    ) {
        this.userIds = userIds;
        this.tasks = tasks;
        this.completedTasks = completedTasks;
        this.taskResults = taskResults;
        this.predictions = predictions;
        this.predictionQueries = predictionQueries;
    }

    @GetMapping
    List<TaskApiModels.UserTaskSummaryResponse> findOpenTasks(
            Authentication authentication
    ) {
        return tasks.findOpenTasks(user(authentication)).stream()
                .map(TaskApiModels.UserTaskSummaryResponse::from)
                .toList();
    }

    @GetMapping("/completed")
    TaskApiModels.CompletedTaskPageResponse findCompletedTasks(
            Authentication authentication,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int size
    ) {
        return TaskApiModels.CompletedTaskPageResponse.from(
                completedTasks.findByUser(
                        user(authentication), cursor, size));
    }

    @GetMapping("/{taskId}/result")
    ResponseEntity<TaskApiModels.MyTaskResultResponse> findMyTaskResult(
            Authentication authentication,
            @PathVariable UUID taskId
    ) {
        TaskApiModels.MyTaskResultResponse response = taskResults.findByTask(
                        user(authentication), id(taskId))
                .map(TaskApiModels.MyTaskResultResponse::from)
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_RESULT_NOT_FOUND",
                        "The task result is not available."));
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "private, no-cache")
                .body(response);
    }

    @GetMapping("/{taskId}")
    TaskApiModels.UserTaskDetailResponse findOpenTask(
            Authentication authentication,
            @PathVariable UUID taskId
    ) {
        TaskUserId userId = user(authentication);
        TaskId resolvedTaskId = id(taskId);
        return tasks.findOpenTask(userId, resolvedTaskId)
                .map(TaskApiModels.UserTaskDetailResponse::from)
                .orElseThrow(() -> unavailable(
                        predictionQueries.findCurrent(
                                userId, resolvedTaskId).state()));
    }

    @PostMapping("/{taskId}/prediction")
    ResponseEntity<TaskApiModels.EnsurePredictionResponse> ensurePrediction(
            Authentication authentication,
            @PathVariable UUID taskId
    ) {
        EnsureTaskPredictionResult result =
                predictions.ensureTaskPrediction(
                        user(authentication), id(taskId));
        TaskApiModels.EnsurePredictionResponse response =
                TaskApiModels.EnsurePredictionResponse.from(result);
        if (result.created()) {
            return ResponseEntity.created(URI.create(
                            "/api/v1/me/tasks/" + taskId + "/prediction"))
                    .body(response);
        }
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{taskId}/prediction")
    TaskApiModels.PredictionViewResponse prediction(
            Authentication authentication,
            @PathVariable UUID taskId
    ) {
        return TaskApiModels.PredictionViewResponse.from(
                predictionQueries.findCurrent(
                        user(authentication), id(taskId)));
    }

    private TaskUserId user(Authentication authentication) {
        return new TaskUserId(userIds.resolve(authentication));
    }

    private static TaskId id(UUID value) {
        return new TaskId(value);
    }

    private static TaskApiException unavailable(
            TaskPredictionQueryService.TaskPredictionViewState state
    ) {
        return switch (state) {
            case TASK_UNPUBLISHED -> TaskApiException.conflict(
                    "TASK_UNPUBLISHED", "The task is not published yet.");
            case TASK_CLOSED -> TaskApiException.conflict(
                    "TASK_CLOSED", "The task is already closed.");
            default -> TaskApiException.notFound(
                    "TASK_NOT_FOUND", "The task does not exist.");
        };
    }
}
