package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.common.TaskQuestionId;

public sealed interface TaskSubmissionAnswerCommand
        permits AcceptTaskPredictionCandidate, UserAnsweredTaskQuestion {

    TaskQuestionId questionId();
}
