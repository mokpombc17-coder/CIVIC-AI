package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;

import java.util.Objects;

public record TaskSubmissionAnswer(
        TaskQuestionId questionId,
        TaskAnswerSource source,
        TaskPredictedReasonId adoptedPredictionCandidateId,
        TaskAnswerValue finalAnswerValue
) {
    public TaskSubmissionAnswer {
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(source, "source");
        Objects.requireNonNull(finalAnswerValue, "finalAnswerValue");
        if (source == TaskAnswerSource.AI_ACCEPTED
                && adoptedPredictionCandidateId == null) {
            throw invalid(
                    "TASK_SUBMISSION_ADOPTED_CANDIDATE_REQUIRED",
                    "AI_ACCEPTED answer requires candidate ID");
        }
        if (source == TaskAnswerSource.USER_ANSWERED
                && adoptedPredictionCandidateId != null) {
            throw invalid(
                    "TASK_SUBMISSION_DIRECT_CANDIDATE_NOT_ALLOWED",
                    "USER_ANSWERED answer must not have candidate ID");
        }
    }

    public static TaskSubmissionAnswer aiAccepted(
            TaskQuestionId questionId,
            TaskPredictedReasonId candidateId,
            TaskAnswerValue exactCandidateAnswer
    ) {
        return new TaskSubmissionAnswer(
                questionId,
                TaskAnswerSource.AI_ACCEPTED,
                candidateId,
                exactCandidateAnswer);
    }

    public static TaskSubmissionAnswer userAnswered(
            TaskQuestionId questionId,
            TaskAnswerValue answerValue
    ) {
        return new TaskSubmissionAnswer(
                questionId,
                TaskAnswerSource.USER_ANSWERED,
                null,
                answerValue);
    }

    private static TaskDomainException invalid(String code, String message) {
        return TaskDomainException.invariant(code, "answer.source", message);
    }
}
