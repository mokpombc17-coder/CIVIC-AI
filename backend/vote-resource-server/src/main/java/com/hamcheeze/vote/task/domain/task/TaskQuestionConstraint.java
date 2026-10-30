package com.hamcheeze.vote.task.domain.task;

public sealed interface TaskQuestionConstraint permits
        SingleChoiceConstraint, MultipleChoiceConstraint,
        ShortTextConstraint, LongTextConstraint,
        NumberConstraint, ScaleConstraint {

    TaskQuestionType questionType();
}
