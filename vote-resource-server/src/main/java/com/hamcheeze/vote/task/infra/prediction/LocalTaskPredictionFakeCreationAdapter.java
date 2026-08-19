package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationCommand;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationException;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationResult;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Component
@Profile("local")
@ConditionalOnProperty(
        prefix = "vote.task.prediction",
        name = "provider",
        havingValue = "fake")
public class LocalTaskPredictionFakeCreationAdapter
        implements PredictionCreationPort {

    private final LocalTaskPredictionProperties properties;

    public LocalTaskPredictionFakeCreationAdapter(
            LocalTaskPredictionProperties properties
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
    }

    @Override
    public PredictionCreationResult create(
            PredictionCreationCommand command
    ) {
        Objects.requireNonNull(command, "command");
        return switch (properties.getScenario()) {
            case SUCCESS -> success(command);
            case FINAL_FAILURE -> throw failure(
                    TaskPredictionAttemptOutcome.HTTP_ERROR,
                    false,
                    422,
                    "LOCAL_FAKE_PREDICTION_FINAL_FAILURE",
                    "local fake prediction final failure");
            case TIMEOUT -> throw failure(
                    TaskPredictionAttemptOutcome.TIMEOUT,
                    true,
                    null,
                    "LOCAL_FAKE_PREDICTION_TIMEOUT",
                    "local fake prediction timeout");
        };
    }

    private static PredictionCreationResult success(
            PredictionCreationCommand command
    ) {
        List<TaskPredictedReason> predictedReasons = new ArrayList<>();
        TaskQuestion question = command.task().questions().getFirst();
        for (TaskOption option : question.options()) {
            for (int order = 1;
                 order <= TaskLimits.PREDICTED_REASONS_PER_OPTION;
                 order++) {
                predictedReasons.add(predictedReason(
                        command, question, option, order));
            }
        }
        String payload = "{\"provider\":\"local-fake\""
                + ",\"scenario\":\"success\""
                + ",\"requestId\":\"" + command.requestId().value() + "\""
                + ",\"predictedReasonCount\":"
                + predictedReasons.size() + "}";
        return new PredictionCreationResult(
                command.requestId(),
                command.task().id(),
                predictedReasons,
                200,
                SanitizedTaskPredictionPayload.fromSanitized(payload));
    }

    private static TaskPredictedReason predictedReason(
            PredictionCreationCommand command,
            TaskQuestion question,
            TaskOption option,
            int order
    ) {
        return new TaskPredictedReason(
                candidateId(command, question, option.id(), order),
                command.requestId(),
                option.id(),
                order,
                option.content() + " 선택 예상 이유 " + order);
    }

    private static TaskPredictedReasonId candidateId(
            PredictionCreationCommand command,
            TaskQuestion question,
            TaskOptionId optionId,
            int order
    ) {
        String seed = command.requestId().value()
                + ":" + question.id().value()
                + ":" + (optionId == null ? "question" : optionId.value())
                + ":" + order;
        UUID value = UUID.nameUUIDFromBytes(
                seed.getBytes(StandardCharsets.UTF_8));
        return new TaskPredictedReasonId(value);
    }

    private static PredictionCreationException failure(
            TaskPredictionAttemptOutcome outcome,
            boolean retryable,
            Integer status,
            String code,
            String message
    ) {
        String payload = "{\"provider\":\"local-fake\""
                + ",\"errorCode\":\"" + code + "\"}";
        return new PredictionCreationException(
                outcome,
                retryable,
                status,
                code,
                message,
                SanitizedTaskPredictionPayload.fromSanitized(payload),
                null);
    }
}
