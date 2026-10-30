package com.hamcheeze.vote.task.domain.answer;

import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

public sealed interface TaskAnswerValue permits SingleChoiceValue,
        MultipleChoiceValue, ShortTextValue, LongTextValue,
        NumberValue, ScaleValue {

    TaskQuestionType questionType();
}
