package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminQueryService.UnavailableItem;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminQueryService.UnavailablePage;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminService.Execution;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAdminService.Action;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class OpinionMapGenerationAdminApiModels {

    private OpinionMapGenerationAdminApiModels() {
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
