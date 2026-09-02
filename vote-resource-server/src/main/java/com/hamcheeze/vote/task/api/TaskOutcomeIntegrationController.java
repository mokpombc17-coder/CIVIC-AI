package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.query.TaskOutcomeQueryService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@Validated
@RestController
@RequestMapping("/api/v1/integrations/persona/tasks/{taskId}")
class TaskOutcomeIntegrationController {

    private static final int MAX_PERSONA_ID_LENGTH = 512;

    private final TaskOutcomeQueryService outcomes;

    TaskOutcomeIntegrationController(TaskOutcomeQueryService outcomes) {
        this.outcomes = outcomes;
    }

    @GetMapping("/outcomes")
    ResponseEntity<TaskOutcomeApiModels.PageResponse> findByTask(
            @PathVariable UUID taskId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "100") int limit
    ) {
        TaskOutcomeApiModels.PageResponse response = outcomes.findByTask(
                        new TaskId(taskId), cursor, limit)
                .map(TaskOutcomeApiModels.PageResponse::from)
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_NOT_FOUND",
                        "The task does not exist."));
        return noStore(response);
    }

    @GetMapping("/outcome")
    ResponseEntity<TaskOutcomeApiModels.OutcomeResponse>
    findByTaskAndPersona(
            @PathVariable UUID taskId,
            @RequestParam
            @NotBlank
            @Size(max = MAX_PERSONA_ID_LENGTH)
            String personaId
    ) {
        TaskOutcomeApiModels.OutcomeResponse response =
                outcomes.findByTaskAndPersona(
                                new TaskId(taskId),
                                new TaskPersonaId(personaId))
                        .map(TaskOutcomeApiModels.OutcomeResponse::from)
                        .orElseThrow(() -> TaskApiException.notFound(
                                "TASK_OUTCOME_NOT_FOUND",
                                "The task outcome does not exist."));
        return noStore(response);
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(body);
    }
}
