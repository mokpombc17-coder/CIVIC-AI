package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyKey;
import com.hamcheeze.vote.task.application.query.AdminTaskQueryService;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationReceipt;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationService;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStatus;
import com.hamcheeze.vote.task.application.task.TaskAdministrationService;
import com.hamcheeze.vote.task.application.task.TaskAdministrationService.TaskCreationExecution;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/tasks")
final class TaskAdminController {

    private static final String IDEMPOTENCY_REPLAYED =
            "Idempotency-Replayed";

    private final TaskAdministrationService administration;
    private final TaskPreparationService preparations;
    private final AdminTaskQueryService queries;
    private final AuthenticatedUserIdResolver userIds;
    private final TaskAdminCreateRequestHashFactory requestHashes =
            new TaskAdminCreateRequestHashFactory();

    TaskAdminController(
            TaskAdministrationService administration,
            TaskPreparationService preparations,
            AdminTaskQueryService queries,
            AuthenticatedUserIdResolver userIds
    ) {
        this.administration = administration;
        this.preparations = preparations;
        this.queries = queries;
        this.userIds = userIds;
    }

    @PostMapping
    ResponseEntity<TaskApiModels.TaskResponse> create(
            Authentication authentication,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody TaskApiModels.TaskWriteRequest request
    ) {
        TaskCreationExecution execution = administration.createDraft(
                        new TaskAdministrationService.CreateDraftCommand(
                                request.title(), request.description(),
                                request.toQuestion()),
                        actor(authentication),
                        TaskIdempotencyKey.parse(idempotencyKey),
                        requestHashes.hash(request));
        TaskApiModels.TaskResponse response = TaskApiModels.TaskResponse.from(
                execution.task());
        return ResponseEntity.created(URI.create(
                        "/api/v1/admin/tasks/" + response.id()))
                .header(IDEMPOTENCY_REPLAYED,
                        Boolean.toString(execution.replayed()))
                .body(response);
    }

    @PutMapping("/{taskId}")
    TaskApiModels.TaskResponse replace(
            Authentication authentication,
            @PathVariable UUID taskId,
            @Valid @RequestBody TaskApiModels.TaskWriteRequest request
    ) {
        return TaskApiModels.TaskResponse.from(administration.replaceDraft(
                id(taskId),
                new TaskAdministrationService.ReplaceDraftCommand(
                        request.title(), request.description(),
                        request.toQuestion()),
                actor(authentication)));
    }

    @GetMapping
    List<TaskApiModels.AdminTaskSummaryResponse> findAll() {
        return queries.findAll().stream()
                .map(TaskApiModels.AdminTaskSummaryResponse::from)
                .toList();
    }

    @GetMapping("/{taskId}")
    TaskApiModels.AdminTaskDetailResponse findById(
            @PathVariable UUID taskId
    ) {
        return queries.findById(id(taskId))
                .map(TaskApiModels.AdminTaskDetailResponse::from)
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_NOT_FOUND", "The task does not exist."));
    }

    @PostMapping("/{taskId}/preparation")
    ResponseEntity<TaskApiModels.TaskPreparationCommandResponse> prepare(
            @PathVariable UUID taskId
    ) {
        TaskPreparationReceipt receipt = preparations.prepare(id(taskId));
        TaskApiModels.TaskPreparationCommandResponse response =
                TaskApiModels.TaskPreparationCommandResponse.from(receipt);
        return receipt.status() == TaskPreparationStatus.PROCESSING
                ? ResponseEntity.accepted().body(response)
                : ResponseEntity.ok(response);
    }

    @PostMapping("/{taskId}/schedule")
    TaskApiModels.TaskResponse schedule(
            Authentication authentication,
            @PathVariable UUID taskId,
            @Valid @RequestBody TaskApiModels.ScheduleRequest request
    ) {
        return TaskApiModels.TaskResponse.from(administration.schedule(
                id(taskId), request.toDomain(), request.reason(),
                actor(authentication)).task());
    }

    @PutMapping("/{taskId}/schedule")
    TaskApiModels.TaskResponse reschedule(
            Authentication authentication,
            @PathVariable UUID taskId,
            @Valid @RequestBody TaskApiModels.ScheduleRequest request
    ) {
        return TaskApiModels.TaskResponse.from(administration.reschedule(
                id(taskId), request.toDomain(), request.reason(),
                actor(authentication)).task());
    }

    @PostMapping("/{taskId}/open-now")
    TaskApiModels.TaskResponse openImmediately(
            Authentication authentication,
            @PathVariable UUID taskId,
            @Valid @RequestBody TaskApiModels.OpenNowRequest request
    ) {
        return TaskApiModels.TaskResponse.from(
                administration.openImmediately(
                        id(taskId), request.closesAt(), request.reason(),
                        actor(authentication)).task());
    }

    @PostMapping("/{taskId}/start-now")
    TaskApiModels.TaskResponse openScheduledNow(
            Authentication authentication,
            @PathVariable UUID taskId,
            @Valid @RequestBody TaskApiModels.ReasonRequest request
    ) {
        return TaskApiModels.TaskResponse.from(
                administration.openScheduledNow(
                        id(taskId), request.reason(),
                        actor(authentication)).task());
    }

    @PutMapping("/{taskId}/deadline")
    TaskApiModels.TaskResponse changeDeadline(
            Authentication authentication,
            @PathVariable UUID taskId,
            @Valid @RequestBody TaskApiModels.DeadlineRequest request
    ) {
        return TaskApiModels.TaskResponse.from(
                administration.changeDeadline(
                        id(taskId), request.closesAt(), request.reason(),
                        actor(authentication)).task());
    }

    @PostMapping("/{taskId}/close")
    TaskApiModels.TaskResponse close(
            Authentication authentication,
            @PathVariable UUID taskId,
            @Valid @RequestBody TaskApiModels.ReasonRequest request
    ) {
        return TaskApiModels.TaskResponse.from(administration.close(
                id(taskId), request.reason(), actor(authentication)).task());
    }

    @PostMapping("/{taskId}/cancel")
    TaskApiModels.TaskResponse cancel(
            Authentication authentication,
            @PathVariable UUID taskId,
            @Valid @RequestBody TaskApiModels.ReasonRequest request
    ) {
        return TaskApiModels.TaskResponse.from(administration.cancel(
                id(taskId), request.reason(), actor(authentication)).task());
    }

    private TaskActorId actor(Authentication authentication) {
        return new TaskActorId(userIds.resolve(authentication));
    }

    private static TaskId id(UUID value) {
        return new TaskId(value);
    }
}
