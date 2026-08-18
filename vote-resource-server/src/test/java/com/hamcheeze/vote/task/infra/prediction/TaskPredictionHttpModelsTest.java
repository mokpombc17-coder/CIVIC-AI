package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.prediction.PredictionCreationCommand;
import com.hamcheeze.vote.task.domain.answer.LongTextValue;
import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.NumberValue;
import com.hamcheeze.vote.task.domain.answer.ScaleValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.task.LongTextConstraint;
import com.hamcheeze.vote.task.domain.task.MultipleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.NumberConstraint;
import com.hamcheeze.vote.task.domain.task.ScaleConstraint;
import com.hamcheeze.vote.task.domain.task.ShortTextConstraint;
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
    void requestPreservesAllQuestionConstraintsAndOtherOption() {
        var request = TaskPredictionHttpModels.PredictionRequest.from(
                command());

        assertThat(request.schemaVersion()).isEqualTo(1);
        assertThat(request.task().questions())
                .extracting(TaskPredictionHttpModels.QuestionPayload::type)
                .containsExactly(
                        "SINGLE_CHOICE", "MULTIPLE_CHOICE", "SHORT_TEXT",
                        "LONG_TEXT", "NUMBER", "SCALE");
        assertThat(request.task().questions().get(0).options())
                .extracting(TaskPredictionHttpModels.OptionPayload::kind)
                .containsExactly("STANDARD", "STANDARD", "OTHER");
        assertThat(request.task().questions().get(0).options().getLast()
                .content()).isEqualTo("기타");
        assertThat(request.task().questions().get(1).constraint()
                .minimumSelections()).isEqualTo(1);
        assertThat(request.task().questions().get(1).constraint()
                .maximumSelections()).isEqualTo(2);
        assertThat(request.task().questions().get(2).constraint()
                .maxLength()).isEqualTo(200);
        assertThat(request.task().questions().get(4).constraint()
                .decimalAllowed()).isTrue();
        assertThat(request.task().questions().get(5).constraint()
                .scaleMinimum()).isEqualTo(1);
        assertThat(request.task().questions().get(5).constraint()
                .scaleMaximum()).isEqualTo(5);
    }

    @Test
    void responseDecodesAllTypedAnswerValues() {
        PredictionCreationCommand command = command();
        List<TaskPredictionHttpModels.CandidatePayload> candidates = List.of(
                candidate(1, 1, answer(
                        TaskQuestionType.SINGLE_CHOICE,
                        selection(1), null, null, null, null)),
                candidate(2, 2, answer(
                        TaskQuestionType.MULTIPLE_CHOICE,
                        null, List.of(selection(4), selection(5)),
                        null, null, null)),
                candidate(3, 3, answer(
                        TaskQuestionType.SHORT_TEXT,
                        null, null, "짧은 답", null, null)),
                candidate(4, 4, answer(
                        TaskQuestionType.LONG_TEXT,
                        null, null, "긴 답", null, null)),
                candidate(5, 5, answer(
                        TaskQuestionType.NUMBER,
                        null, null, null, new BigDecimal("42.5"), null)),
                candidate(6, 6, answer(
                        TaskQuestionType.SCALE,
                        null, null, null, null, 4)));
        var response = new TaskPredictionHttpModels.PredictionResponse(
                1, REQUEST_ID, TASK_ID, candidates);

        var decoded = response.toDomain(command);

        assertThat(decoded)
                .extracting(candidate -> candidate.answerValue()
                        .getClass().getSimpleName())
                .containsExactly(
                        SingleChoiceValue.class.getSimpleName(),
                        MultipleChoiceValue.class.getSimpleName(),
                        ShortTextValue.class.getSimpleName(),
                        LongTextValue.class.getSimpleName(),
                        NumberValue.class.getSimpleName(),
                        ScaleValue.class.getSimpleName());
        assertThat(((MultipleChoiceValue) decoded.get(1).answerValue())
                .selections()).hasSize(2);
        assertThat(((NumberValue) decoded.get(4).answerValue()).value())
                .isEqualByComparingTo("42.5");
    }

    private static PredictionCreationCommand command() {
        return new PredictionCreationCommand(
                new TaskPredictionId(REQUEST_ID),
                new TaskPersonaId("persona-a"),
                task(),
                "policy-v1",
                2,
                Duration.ofSeconds(60));
    }

    private static Task task() {
        List<TaskQuestion> questions = List.of(
                new TaskQuestion(
                        questionId(1), 1,
                        TaskQuestionType.SINGLE_CHOICE,
                        "단일 선택", null,
                        new SingleChoiceConstraint(),
                        List.of(
                                TaskOption.standard(optionId(1), 1, "A"),
                                TaskOption.standard(optionId(2), 2, "B"),
                                TaskOption.other(optionId(3), 3))),
                new TaskQuestion(
                        questionId(2), 2,
                        TaskQuestionType.MULTIPLE_CHOICE,
                        "복수 선택", null,
                        new MultipleChoiceConstraint(1, 2),
                        List.of(
                                TaskOption.standard(optionId(4), 1, "C"),
                                TaskOption.standard(optionId(5), 2, "D"))),
                new TaskQuestion(
                        questionId(3), 3,
                        TaskQuestionType.SHORT_TEXT,
                        "짧은 글", null,
                        new ShortTextConstraint(200), List.of()),
                new TaskQuestion(
                        questionId(4), 4,
                        TaskQuestionType.LONG_TEXT,
                        "긴 글", null,
                        new LongTextConstraint(2_000), List.of()),
                new TaskQuestion(
                        questionId(5), 5,
                        TaskQuestionType.NUMBER,
                        "숫자", null,
                        new NumberConstraint(
                                BigDecimal.ZERO,
                                new BigDecimal("100"),
                                true),
                        List.of()),
                new TaskQuestion(
                        questionId(6), 6,
                        TaskQuestionType.SCALE,
                        "척도", null,
                        new ScaleConstraint(1, 5, "낮음", "높음"),
                        List.of()));
        return Task.draft(
                new TaskId(TASK_ID), "모든 유형 과업", null,
                questions, Instant.parse("2026-08-18T00:00:00Z"));
    }

    private static TaskPredictionHttpModels.CandidatePayload candidate(
            int candidate,
            int question,
            TaskPredictionHttpModels.AnswerPayload answer
    ) {
        return new TaskPredictionHttpModels.CandidatePayload(
                new UUID(20, candidate),
                questionId(question).value(),
                1,
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
