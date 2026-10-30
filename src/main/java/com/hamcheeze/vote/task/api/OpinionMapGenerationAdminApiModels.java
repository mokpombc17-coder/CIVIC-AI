package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.opinionmap.AdminOpinionMapGenerationView;
import com.hamcheeze.vote.task.application.opinionmap.AdminOpinionMapGenerationView.AreaStatus;
import com.hamcheeze.vote.task.application.opinionmap.AdminOpinionMapGenerationView.Status;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminQueryService.UnavailableItem;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminQueryService.UnavailablePage;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminService.Execution;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminService.Action;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminService.RegenerationExecution;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRun;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRunHistory;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class OpinionMapGenerationAdminApiModels {

    private OpinionMapGenerationAdminApiModels() {
    }

    record RunHistoryResponse(
            List<OpinionMapGenerationRunHistory> runs
    ) {
        RunHistoryResponse {
            runs = List.copyOf(runs);
        }
    }

    record DetailResponse(
            UUID taskId,
            Integer resultVersion,
            Status status,
            int attemptCount,
            String lastErrorCode,
            Instant nextAttemptAt,
            Instant processingStartedAt,
            Instant completedAt,
            Instant updatedAt,
            boolean canGenerate,
            boolean canRetry,
            boolean canRegenerate,
            List<OptionResponse> options
    ) {
        static DetailResponse from(AdminOpinionMapGenerationView view) {
            return new DetailResponse(
                    view.taskId().value(),
                    view.resultVersion(),
                    view.status(),
                    view.attemptCount(),
                    view.lastErrorCode(),
                    view.nextAttemptAt(),
                    view.processingStartedAt(),
                    view.completedAt(),
                    view.updatedAt(),
                    view.canGenerate(),
                    view.canRetry(),
                    view.canRegenerate(),
                    view.options().stream()
                            .map(OptionResponse::from)
                            .toList());
        }
    }

    record OptionResponse(
            UUID optionId,
            int displayOrder,
            String content,
            Integer responseCount,
            AreaResponse sameChoice,
            AreaResponse otherChoices
    ) {
        static OptionResponse from(
                AdminOpinionMapGenerationView.OptionView option
        ) {
            return new OptionResponse(
                    option.optionId().value(),
                    option.displayOrder(),
                    option.content(),
                    option.responseCount(),
                    AreaResponse.from(option.sameChoice()),
                    AreaResponse.from(option.otherChoices()));
        }
    }

    record AreaResponse(AreaStatus status, String body) {
        static AreaResponse from(
                AdminOpinionMapGenerationView.Area area
        ) {
            return area == null
                    ? null
                    : new AreaResponse(area.status(), area.body());
        }
    }

    record CommandResponse(
            UUID taskId,
            int resultVersion,
            OpinionMapGenerationStatus status,
            int attemptCount,
            Action action,
            Instant updatedAt
    ) {
        static CommandResponse from(Execution execution) {
            OpinionMapGeneration generation = execution.generation();
            return new CommandResponse(
                    generation.taskId().value(),
                    generation.resultVersion(),
                    generation.status(),
                    generation.attemptCount(),
                    execution.action(),
                    generation.updatedAt());
        }
    }

    record RegenerationResponse(
            UUID taskId,
            int resultVersion,
            UUID runId,
            int runNumber,
            OpinionMapGenerationRun.Status status,
            int attemptCount,
            boolean created,
            Instant requestedAt,
            Instant updatedAt
    ) {
        static RegenerationResponse from(
                RegenerationExecution execution
        ) {
            OpinionMapGenerationRun run = execution.run();
            return new RegenerationResponse(
                    execution.taskId().value(),
                    execution.resultVersion(),
                    run.runId(),
                    run.runNumber(),
                    run.status(),
                    run.attemptCount(),
                    execution.created(),
                    run.requestedAt(),
                    run.updatedAt());
        }
    }

    record UnavailablePageResponse(
            List<UnavailableItemResponse> items,
            String nextCursor
    ) {
        static UnavailablePageResponse from(UnavailablePage page) {
            return new UnavailablePageResponse(
                    page.items().stream()
                            .map(UnavailableItemResponse::from)
                            .toList(),
                    page.nextCursor());
        }
    }

    record UnavailableItemResponse(
            UUID taskId,
            String taskTitle,
            int resultVersion,
            int attemptCount,
            String lastErrorCode,
            Instant failedAt,
            boolean canRetry
    ) {
        static UnavailableItemResponse from(UnavailableItem item) {
            return new UnavailableItemResponse(
                    item.taskId().value(),
                    item.taskTitle(),
                    item.resultVersion(),
                    item.attemptCount(),
                    item.lastErrorCode(),
                    item.failedAt(),
                    item.canRetry());
        }
    }
}
