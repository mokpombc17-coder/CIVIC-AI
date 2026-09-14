package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminDetailQueryService;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminQueryService;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminService;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminService.Execution;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin")
final class OpinionMapGenerationAdminController {

    private final OpinionMapGenerationAdminService commands;
    private final OpinionMapGenerationAdminQueryService queries;
    private final OpinionMapGenerationAdminDetailQueryService details;
    private final AuthenticatedUserIdResolver userIds;

    OpinionMapGenerationAdminController(
            OpinionMapGenerationAdminService commands,
            OpinionMapGenerationAdminQueryService queries,
            OpinionMapGenerationAdminDetailQueryService details,
            AuthenticatedUserIdResolver userIds
    ) {
        this.commands = commands;
        this.queries = queries;
        this.details = details;
        this.userIds = userIds;
    }

    @GetMapping("/tasks/{taskId}/opinion-map-generation")
    OpinionMapGenerationAdminApiModels.DetailResponse findByTaskId(
            @PathVariable UUID taskId
    ) {
        return details.findByTaskId(new TaskId(taskId))
                .map(OpinionMapGenerationAdminApiModels.DetailResponse::from)
                .orElseThrow(() -> TaskApiException.notFound(
                        "TASK_NOT_FOUND", "The task does not exist."));
    }

    @PostMapping("/tasks/{taskId}/opinion-map-generation")
    ResponseEntity<OpinionMapGenerationAdminApiModels.CommandResponse>
    request(
            Authentication authentication,
            @PathVariable UUID taskId
    ) {
        Execution execution = commands.request(
                new TaskId(taskId), userIds.resolve(authentication));
        OpinionMapGenerationAdminApiModels.CommandResponse response =
                OpinionMapGenerationAdminApiModels.CommandResponse.from(
                        execution);
        return execution.changed()
                ? ResponseEntity.accepted().body(response)
                : ResponseEntity.ok(response);
    }

    @GetMapping("/opinion-map-generations/unavailable")
    OpinionMapGenerationAdminApiModels.UnavailablePageResponse unavailable(
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit
    ) {
        return OpinionMapGenerationAdminApiModels.UnavailablePageResponse.from(
                queries.findUnavailable(cursor, limit));
    }
}
