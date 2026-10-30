package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.domain.answer.LongTextValue;
import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.NumberValue;
import com.hamcheeze.vote.task.domain.answer.ScaleValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.task.TaskOptionKind;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

final class TaskAnswerJpaCodec {

    private TaskAnswerJpaCodec() {
    }

    static EncodedAnswer encode(TaskAnswerValue answer) {
        return switch (answer) {
            case SingleChoiceValue single -> new EncodedAnswer(
                    answer.questionType(), null, null, null,
                    List.of(single.selection()));
            case MultipleChoiceValue multiple -> new EncodedAnswer(
                    answer.questionType(), null, null, null,
                    multiple.selections());
            case ShortTextValue text -> new EncodedAnswer(
                    answer.questionType(), text.value(), null, null, List.of());
            case LongTextValue text -> new EncodedAnswer(
                    answer.questionType(), text.value(), null, null, List.of());
            case NumberValue number -> new EncodedAnswer(
                    answer.questionType(), null, number.value(), null, List.of());
            case ScaleValue scale -> new EncodedAnswer(
                    answer.questionType(), null, null, scale.value(), List.of());
        };
    }

    static TaskAnswerValue decode(
            TaskQuestionType type,
            String textValue,
            BigDecimal numberValue,
            Integer scaleValue,
            List<StoredSelection> selections
    ) {
        return switch (type) {
            case SINGLE_CHOICE -> new SingleChoiceValue(
                    selection(requireSingle(selections)));
            case MULTIPLE_CHOICE -> new MultipleChoiceValue(
                    selections.stream()
                            .map(TaskAnswerJpaCodec::selection)
                            .toList());
            case SHORT_TEXT -> new ShortTextValue(textValue);
            case LONG_TEXT -> new LongTextValue(textValue);
            case NUMBER -> new NumberValue(numberValue);
            case SCALE -> new ScaleValue(scaleValue);
        };
    }

    private static StoredSelection requireSingle(
            List<StoredSelection> selections
    ) {
        if (selections.size() != 1) {
            throw new IllegalStateException(
                    "single-choice answer must have exactly one selection");
        }
        return selections.getFirst();
    }

    private static TaskOptionSelection selection(StoredSelection selection) {
        return new TaskOptionSelection(
                new TaskOptionId(selection.optionId()),
                selection.otherText());
    }

    record EncodedAnswer(
            TaskQuestionType type,
            String textValue,
            BigDecimal numberValue,
            Integer scaleValue,
            List<TaskOptionSelection> selections
    ) {
    }

    record StoredSelection(
            UUID optionId,
            TaskOptionKind optionKind,
            String otherText
    ) {
    }
}
