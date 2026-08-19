package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;

public sealed interface TaskSubmissionAnswerCommand
        permits AcceptTaskPredictedReason, WriteTaskReason {

    TaskQuestionId questionId();

    TaskOptionId selectedOptionId();
}
