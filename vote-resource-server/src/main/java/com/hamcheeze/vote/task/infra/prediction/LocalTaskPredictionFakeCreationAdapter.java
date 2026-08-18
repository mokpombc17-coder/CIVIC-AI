package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationCommand;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationException;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationResult;
import com.hamcheeze.vote.task.domain.answer.LongTextValue;
import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.NumberValue;
import com.hamcheeze.vote.task.domain.answer.ScaleValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.task.MultipleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.NumberConstraint;
import com.hamcheeze.vote.task.domain.task.ScaleConstraint;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskOptionKind;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
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
        List<TaskPredictionCandidate> candidates = new ArrayList<>();
        for (TaskQuestion question : command.task().questions()) {
            if (question.type()
                    == com.hamcheeze.vote.task.domain.task.TaskQuestionType
                    .SINGLE_CHOICE) {
                for (TaskOption option : question.options()) {
                    for (int order = 1;
                         order <= command.requestedCandidateCount();
                         order++) {
                        candidates.add(candidate(
                                command, question, option, order));
                    }
                }
            } else {
                for (int order = 1;
                     order <= command.requestedCandidateCount();
                     order++) {
                    candidates.add(new TaskPredictionCandidate(
                            candidateId(
                                    command, question, null, order),
                            command.requestId(),
                            question.id(),
                            order,
                            answer(question, order),
                            "local fake 예상 이유 " + order));
                }
            }
        }
        String payload = "{\"provider\":\"local-fake\""
                + ",\"scenario\":\"success\""
                + ",\"requestId\":\"" + command.requestId().value() + "\""
                + ",\"candidateCount\":" + candidates.size() + "}";
        return new PredictionCreationResult(
                command.requestId(),
                command.task().id(),
                candidates,
                200,
                SanitizedTaskPredictionPayload.fromSanitized(payload));
    }

    private static TaskPredictionCandidate candidate(
            PredictionCreationCommand command,
            TaskQuestion question,
            TaskOption option,
            int order
    ) {
        TaskOptionSelection selection = new TaskOptionSelection(
                option.id(),
                option.kind() == TaskOptionKind.OTHER
                        ? "local 기타 예상 답변 " + order
                        : null);
        return new TaskPredictionCandidate(
                candidateId(command, question, option.id(), order),
                command.requestId(),
                question.id(),
                order,
                new SingleChoiceValue(selection),
                option.content() + " 선택 예상 이유 " + order);
    }

    private static TaskAnswerValue answer(
            TaskQuestion question,
            int order
    ) {
        return switch (question.type()) {
            case SINGLE_CHOICE -> throw new IllegalArgumentException(
                    "single choice candidates require an option slot");
            case MULTIPLE_CHOICE -> multipleChoice(question, order);
            case SHORT_TEXT -> new ShortTextValue(
                    "local 예상 단답 " + order);
            case LONG_TEXT -> new LongTextValue(
                    "local 환경에서 생성한 예상 서술 답변 " + order
                            + "입니다.");
            case NUMBER -> number(question, order);
            case SCALE -> scale(question, order);
        };
    }

    private static MultipleChoiceValue multipleChoice(
            TaskQuestion question,
            int order
    ) {
        MultipleChoiceConstraint constraint =
                (MultipleChoiceConstraint) question.constraint();
        int span = constraint.maximumSelections()
                - constraint.minimumSelections() + 1;
        int requested = constraint.minimumSelections()
                + (order - 1) % span;
        int count = Math.min(requested, question.options().size());
        List<TaskOptionSelection> selections = question.options().stream()
                .limit(count)
                .map(LocalTaskPredictionFakeCreationAdapter::selection)
                .toList();
        return new MultipleChoiceValue(selections);
    }

    private static TaskOptionSelection selection(TaskOption option) {
        return new TaskOptionSelection(
                option.id(),
                option.kind() == TaskOptionKind.OTHER
                        ? "local 기타 예상 답변"
                        : null);
    }

    private static NumberValue number(
            TaskQuestion question,
            int order
    ) {
        NumberConstraint constraint =
                (NumberConstraint) question.constraint();
        BigDecimal value;
        if (order % 2 == 1) {
            value = firstPresent(
                    constraint.minimumValue(),
                    constraint.maximumValue(),
                    BigDecimal.ZERO);
        } else {
            value = firstPresent(
                    constraint.maximumValue(),
                    constraint.minimumValue(),
                    constraint.decimalAllowed()
                            ? new BigDecimal("1.5")
                            : BigDecimal.ONE);
        }
        return new NumberValue(value);
    }

    private static ScaleValue scale(
            TaskQuestion question,
            int order
    ) {
        ScaleConstraint constraint =
                (ScaleConstraint) question.constraint();
        return new ScaleValue(order % 2 == 1
                ? constraint.minimumValue()
                : constraint.maximumValue());
    }

    private static BigDecimal firstPresent(
            BigDecimal first,
            BigDecimal second,
            BigDecimal fallback
    ) {
        return first != null ? first : second != null ? second : fallback;
    }

    private static TaskPredictionCandidateId candidateId(
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
        return new TaskPredictionCandidateId(value);
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
