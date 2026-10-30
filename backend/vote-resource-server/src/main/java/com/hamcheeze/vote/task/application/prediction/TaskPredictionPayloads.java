package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;

final class TaskPredictionPayloads {

    private TaskPredictionPayloads() {
    }

    static SanitizedTaskPredictionPayload request(
            PredictionCreationCommand command
    ) {
        return SanitizedTaskPredictionPayload.fromSanitized(
                "{\"requestId\":\"" + command.requestId().value()
                        + "\",\"personaId\":\""
                        + escape(command.personaId().value())
                        + "\",\"taskId\":\"" + command.task().id().value()
                        + "\",\"candidatePolicyVersion\":\""
                        + escape(command.candidatePolicyVersion())
                        + "\",\"minimumReasonsPerOption\":"
                        + TaskLimits.MIN_PREDICTED_REASONS_PER_OPTION
                        + ",\"maximumReasonsPerOption\":"
                        + TaskLimits.MAX_PREDICTED_REASONS_PER_OPTION
                        + ",\"requestTimeoutMillis\":"
                        + command.requestTimeout().toMillis()
                        + ",\"questionCount\":"
                        + command.task().questions().size() + "}");
    }

    static SanitizedTaskPredictionPayload ignored(String reason) {
        return SanitizedTaskPredictionPayload.fromSanitized(
                "{\"ignored\":true,\"reason\":\""
                        + escape(reason) + "\"}");
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
