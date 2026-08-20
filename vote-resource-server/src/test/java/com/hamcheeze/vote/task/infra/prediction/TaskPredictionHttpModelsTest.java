package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.prediction.PredictionCreationCommand;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionInputSnapshot;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TaskPredictionHttpModelsTest {

    private static final UUID TASK_ID = new UUID(10, 1);
    private static final UUID REQUEST_ID = new UUID(10, 2);

    @Test
    void requestContainsOneSingleChoiceQuestionAndStandardOptions() {
        var request = TaskPredictionHttpModels.PredictionRequest.from(
                command());

        assertThat(request.schemaVersion()).isEqualTo(1);
        assertThat(request.task().questions())
                .extracting(TaskPredictionHttpModels.QuestionPayload::type)
                .containsExactly("SINGLE_CHOICE");
        assertThat(request.task().questions().get(0).options())
                .extracting(TaskPredictionHttpModels.OptionPayload::kind)
                .containsExactly("STANDARD", "STANDARD");
        assertThat(request.task().questions().getFirst().options())
                .extracting(TaskPredictionHttpModels.OptionPayload::content)
                .containsExactly("A", "B");
    }

    @Test
    void responseDecodesTwoReasonsPerSingleChoiceOption() {
        PredictionCreationCommand command = command();
        List<TaskPredictionHttpModels.CandidatePayload> candidates = List.of(
                candidate(1, 1, 1, answer(
                        TaskQuestionType.SINGLE_CHOICE,
                        selection(1), null, null, null, null)),
                candidate(2, 1, 2, answer(
                        TaskQuestionType.SINGLE_CHOICE,
                        selection(1), null, null, null, null)),
                candidate(3, 1, 1, answer(
                        TaskQuestionType.SINGLE_CHOICE,
                        selection(2), null, null, null, null)),
                candidate(4, 1, 2, answer(
                        TaskQuestionType.SINGLE_CHOICE,
                        selection(2), null, null, null, null)));
        var response = new TaskPredictionHttpModels.PredictionResponse(
                1, REQUEST_ID, TASK_ID, candidates);

        var decoded = response.toDomain(command);

        assertThat(decoded)
                .extracting(TaskPredictedReason::optionId)
                .containsExactly(
                        optionId(1), optionId(1),
                        optionId(2), optionId(2));
    }

    private static PredictionCreationCommand command() {
        return new PredictionCreationCommand(
                new TaskPredictionId(REQUEST_ID),
                new TaskPersonaId("persona-a"),
                task(),
                "policy-v1",
                1,
                "{}",
                TaskPredictionInputSnapshot.fingerprint("{}"),
                Duration.ofSeconds(60));
    }

    private static Task task() {
        List<TaskQuestion> questions = List.of(new TaskQuestion(
                questionId(1), 1,
                TaskQuestionType.SINGLE_CHOICE,
                "단일 선택", null,
                new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(optionId(1), 1, "A"),
                        TaskOption.standard(optionId(2), 2, "B"))));
        return Task.draft(
                new TaskId(TASK_ID), "모든 유형 과업", null,
                questions, Instant.parse("2026-08-18T00:00:00Z"));
    }

    private static TaskPredictionHttpModels.CandidatePayload candidate(
            int candidate,
            int question,
            int order,
            TaskPredictionHttpModels.AnswerPayload answer
    ) {
        return new TaskPredictionHttpModels.CandidatePayload(
                new UUID(20, candidate),
                questionId(question).value(),
                order,
                answer,
                "이유 " + candidate);
    }

    private static TaskPredictionHttpModels.AnswerPayload answer(
            TaskQuestionType type,
            TaskPredictionHttpModels.SelectionPayload selection,
            List<TaskPredictionHttpModels.SelectionPayload> selections,
            String text,
            BigDecimal number,
            Integer scale
    ) {
        return new TaskPredictionHttpModels.AnswerPayload(
                type, selection, selections, text, number, scale);
    }

    private static TaskPredictionHttpModels.SelectionPayload selection(
            int option
    ) {
        return new TaskPredictionHttpModels.SelectionPayload(
                optionId(option).value(), null);
    }

    private static TaskQuestionId questionId(int value) {
        return new TaskQuestionId(new UUID(30, value));
    }

    private static TaskOptionId optionId(int value) {
        return new TaskOptionId(new UUID(40, value));
    }
}
