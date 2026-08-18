package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.answer.LongTextValue;
import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.NumberValue;
import com.hamcheeze.vote.task.domain.answer.ScaleValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskValidationException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static com.hamcheeze.vote.task.TaskTestFixtures.optionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.questionId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskQuestionTest {

    @Test
    void validatesAndNormalizesAllSixAnswerTypes() {
        TaskQuestion single = choice(
                TaskQuestionType.SINGLE_CHOICE,
                new SingleChoiceConstraint());
        TaskQuestion multiple = choice(
                TaskQuestionType.MULTIPLE_CHOICE,
                new MultipleChoiceConstraint(1, 2));
        TaskQuestion shortText = text(
                3, TaskQuestionType.SHORT_TEXT,
                new ShortTextConstraint(20));
        TaskQuestion longText = text(
                4, TaskQuestionType.LONG_TEXT,
                new LongTextConstraint(100));
        TaskQuestion number = text(
                5, TaskQuestionType.NUMBER,
                new NumberConstraint(
                        BigDecimal.ZERO, BigDecimal.TEN, true));
        TaskQuestion scale = text(
                6, TaskQuestionType.SCALE,
                new ScaleConstraint(1, 5, "낮음", "높음"));

        assertThat(single.validateAndNormalize(new SingleChoiceValue(
                new TaskOptionSelection(optionId(1), null))))
                .isEqualTo(new SingleChoiceValue(
                        new TaskOptionSelection(optionId(1), null)));
        assertThat(multiple.validateAndNormalize(new MultipleChoiceValue(
                List.of(new TaskOptionSelection(optionId(2), null)))))
                .isInstanceOf(MultipleChoiceValue.class);
        assertThat(shortText.validateAndNormalize(
                new ShortTextValue("  답변  ")))
                .isEqualTo(new ShortTextValue("답변"));
        assertThat(longText.validateAndNormalize(
                new LongTextValue("  긴 답변  ")))
                .isEqualTo(new LongTextValue("긴 답변"));
        assertThat(number.validateAndNormalize(
                new NumberValue(new BigDecimal("3.00"))))
                .isEqualTo(new NumberValue(new BigDecimal("3")));
        assertThat(scale.validateAndNormalize(new ScaleValue(4)))
                .isEqualTo(new ScaleValue(4));
    }

    @Test
    void otherOptionRequiresTrimmedTextAndStandardRejectsIt() {
        TaskQuestion question = new TaskQuestion(
                questionId(1), 1, TaskQuestionType.SINGLE_CHOICE,
                "질문", null, new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(optionId(1), 1, "A"),
                        TaskOption.standard(optionId(2), 2, "B"),
                        TaskOption.other(optionId(3), 3)));

        assertThat(question.validateAndNormalize(new SingleChoiceValue(
                new TaskOptionSelection(optionId(3), "  직접 입력  "))))
                .isEqualTo(new SingleChoiceValue(
                        new TaskOptionSelection(optionId(3), "직접 입력")));
        assertThatThrownBy(() -> question.validateAndNormalize(
                new SingleChoiceValue(
                        new TaskOptionSelection(optionId(1), "불가"))))
                .isInstanceOf(TaskValidationException.class);
    }

    @Test
    void rejectsInvalidQuestionStructureAndAnswers() {
        assertThatThrownBy(() -> new TaskQuestion(
                questionId(1), 1, TaskQuestionType.SINGLE_CHOICE,
                "질문", null, new SingleChoiceConstraint(),
                List.of(TaskOption.standard(optionId(1), 1, "A"))))
                .isInstanceOf(TaskValidationException.class);

        TaskQuestion shortText = text(
                1, TaskQuestionType.SHORT_TEXT,
                new ShortTextConstraint(10));
        assertThatThrownBy(() -> shortText.validateAndNormalize(
                new ShortTextValue("두 줄\n답변")))
                .isInstanceOfSatisfying(
                        TaskValidationException.class,
                        exception -> assertThat(exception.violations())
                                .extracting(violation -> violation.code())
                                .isEqualTo(
                                        List.of(
                                                "TASK_SHORT_TEXT_LINE_BREAK_NOT_ALLOWED")));
        assertThatThrownBy(() -> shortText.validateAndNormalize(
                new ScaleValue(3)))
                .isInstanceOf(TaskValidationException.class);
    }

    @Test
    void rejectsBlankContentDuplicateOptionsAndConstraintMismatch() {
        assertThatThrownBy(() -> new TaskQuestion(
                questionId(1), 1, TaskQuestionType.SHORT_TEXT,
                "   ", null, ShortTextConstraint.defaults(), List.of()))
                .isInstanceOf(TaskDomainException.class);

        assertThatThrownBy(() -> new TaskQuestion(
                questionId(1), 1, TaskQuestionType.SINGLE_CHOICE,
                "질문", null, new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(optionId(1), 1, "중복"),
                        TaskOption.standard(optionId(2), 2, "중복"))))
                .isInstanceOfSatisfying(
                        TaskValidationException.class,
                        exception -> assertThat(exception.violations())
                                .extracting(violation -> violation.code())
                                .contains("TASK_OPTION_CONTENT_DUPLICATED"));

        assertThatThrownBy(() -> new TaskQuestion(
                questionId(1), 1, TaskQuestionType.SHORT_TEXT,
                "질문", null, new SingleChoiceConstraint(), List.of()))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_QUESTION_CONSTRAINT_TYPE_MISMATCH"));
    }

    @Test
    void enforcesMultipleNumberAndScaleBoundaries() {
        TaskQuestion multiple = choice(
                TaskQuestionType.MULTIPLE_CHOICE,
                new MultipleChoiceConstraint(2, 2));
        assertThatThrownBy(() -> multiple.validateAndNormalize(
                new MultipleChoiceValue(List.of(
                        new TaskOptionSelection(optionId(1), null)))))
                .isInstanceOf(TaskValidationException.class);

        TaskQuestion integer = text(
                5, TaskQuestionType.NUMBER,
                new NumberConstraint(
                        BigDecimal.ZERO, BigDecimal.TEN, false));
        assertThatThrownBy(() -> integer.validateAndNormalize(
                new NumberValue(new BigDecimal("1.5"))))
                .isInstanceOf(TaskDomainException.class);
        assertThatThrownBy(() -> integer.validateAndNormalize(
                new NumberValue(new BigDecimal("11"))))
                .isInstanceOf(TaskValidationException.class);

        TaskQuestion scale = text(
                6, TaskQuestionType.SCALE,
                new ScaleConstraint(0, 10, null, null));
        assertThatThrownBy(() -> scale.validateAndNormalize(
                new ScaleValue(11)))
                .isInstanceOf(TaskValidationException.class);
    }

    private static TaskQuestion choice(
            TaskQuestionType type,
            TaskQuestionConstraint constraint
    ) {
        return new TaskQuestion(
                questionId(type.ordinal() + 1), 1, type,
                "질문", null, constraint,
                List.of(
                        TaskOption.standard(optionId(1), 1, "A"),
                        TaskOption.standard(optionId(2), 2, "B")));
    }

    private static TaskQuestion text(
            int id,
            TaskQuestionType type,
            TaskQuestionConstraint constraint
    ) {
        return new TaskQuestion(
                questionId(id), 1, type, "질문", null,
                constraint, List.of());
    }
}
