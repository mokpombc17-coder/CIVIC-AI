package com.hamcheeze.vote.opinionmap.api;

import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotQueryService.ParticipantResponse;
import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotQueryService.QuestionResult;
import com.hamcheeze.vote.opinionmap.application.query.OpinionMapSnapshotQueryService.SnapshotResult;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapReasonSource;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapTaskClosureType;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class OpinionMapApiModels {

    private OpinionMapApiModels() {
    }

    record SnapshotResponse(
            UUID snapshotId,
            UUID taskId,
            String status,
            OpinionMapTaskClosureType closureType,
            Instant closedAt,
            Instant finalizedAt,
            int expectedSubmissionCount,
            int responseCount,
            String responseHashFormat,
            String responseHashSha256,
            TaskContextResponse task,
            List<ParticipantResponseView> responses
    ) {

        static SnapshotResponse from(SnapshotResult result) {
            return new SnapshotResponse(
                    result.snapshotId(),
                    result.taskId(),
                    result.status().name(),
                    result.closureType(),
                    result.closedAt(),
                    result.finalizedAt(),
                    result.expectedSubmissionCount(),
                    result.responseCount(),
                    result.responseHashFormat(),
                    result.responseHashSha256(),
                    new TaskContextResponse(
                            result.taskTitle(),
                            result.taskDescription(),
                            QuestionResponse.from(result.question())),
                    result.responses().stream()
                            .map(ParticipantResponseView::from)
                            .toList());
        }
    }

    record TaskContextResponse(
            String title,
            String description,
            QuestionResponse question
    ) {
    }

    record QuestionResponse(
            UUID questionId,
            String content,
            String description,
            List<OptionResponse> options
    ) {

        static QuestionResponse from(QuestionResult result) {
            return new QuestionResponse(
                    result.questionId(),
                    result.content(),
                    result.description(),
                    result.options().stream()
                            .map(option -> new OptionResponse(
                                    option.optionId(),
                                    option.displayOrder(),
                                    option.content(),
                                    option.responseCount()))
                            .toList());
        }
    }

    record OptionResponse(
            UUID optionId,
            int displayOrder,
            String content,
            int responseCount
    ) {
    }

    record ParticipantResponseView(
            UUID submissionId,
            String participantId,
            UUID predictionId,
            UUID personaGenerationId,
            UUID personaVersionId,
            UUID selectedOptionId,
            OpinionMapReasonSource reasonSource,
            UUID acceptedPredictedReasonId,
            String finalReason,
            Instant submittedAt
    ) {

        static ParticipantResponseView from(ParticipantResponse response) {
            return new ParticipantResponseView(
                    response.submissionId(),
                    response.participantId(),
                    response.predictionId(),
                    response.personaGenerationId(),
                    response.personaVersionId(),
                    response.selectedOptionId(),
                    response.reasonSource(),
                    response.acceptedPredictedReasonId(),
                    response.finalReason(),
                    response.submittedAt());
        }
    }
}
