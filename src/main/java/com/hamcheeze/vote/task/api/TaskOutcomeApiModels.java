package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.application.query.TaskOutcomeQueryService;
import com.hamcheeze.vote.task.application.query.TaskOutcomeView;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class TaskOutcomeApiModels {

    private static final int SCHEMA_VERSION = 1;

    private TaskOutcomeApiModels() {
    }

    record PageResponse(
            int schemaVersion,
            List<OutcomeResponse> items,
            String nextCursor,
            boolean hasMore
    ) {
        static PageResponse from(
                TaskOutcomeQueryService.TaskOutcomePage page
        ) {
            return new PageResponse(
                    SCHEMA_VERSION,
                    page.items().stream()
                            .map(OutcomeResponse::from)
                            .toList(),
                    page.nextCursor(),
                    page.hasMore());
        }
    }

    record OutcomeResponse(
            int schemaVersion,
            UUID outcomeId,
            String personaId,
            UUID predictionRequestId,
            UUID taskId,
            UUID questionId,
            UUID selectedOptionId,
            String reasonSource,
            UUID acceptedCandidateId,
            String finalReason,
            Instant submittedAt
    ) {
        static OutcomeResponse from(TaskOutcomeView outcome) {
            return new OutcomeResponse(
                    SCHEMA_VERSION,
                    outcome.outcomeId().value(),
                    outcome.personaId().value(),
                    outcome.predictionRequestId() == null
                            ? null
                            : outcome.predictionRequestId().value(),
                    outcome.taskId().value(),
                    outcome.questionId().value(),
                    outcome.selectedOptionId().value(),
                    outcome.reasonSource().name(),
                    outcome.acceptedCandidateId() == null
                            ? null
                            : outcome.acceptedCandidateId().value(),
                    outcome.finalReason(),
                    outcome.submittedAt());
        }
    }
}
