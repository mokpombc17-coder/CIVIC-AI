package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskText;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;

import java.time.Instant;
import java.util.Objects;

import static com.hamcheeze.vote.task.domain.common.TaskLimits.MAX_REASON_LENGTH;

public final class TaskSubmission {

    private final TaskSubmissionId id;
    private final TaskUserId userId;
    private final TaskId taskId;
    private final TaskPersonaGenerationId personaGenerationId;
    private final TaskPersonaVersionId personaVersionId;
    private final TaskPredictionId predictionId;
    private final TaskQuestionId questionId;
    private final TaskOptionId selectedOptionId;
    private final TaskReasonSource reasonSource;
    private final TaskPredictedReasonId acceptedPredictedReasonId;
    private final String finalReason;
    private final Instant submittedAt;

    private TaskSubmission(
            TaskSubmissionId id,
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskPredictionId predictionId,
            TaskQuestionId questionId,
            TaskOptionId selectedOptionId,
            TaskReasonSource reasonSource,
            TaskPredictedReasonId acceptedPredictedReasonId,
            String finalReason,
            Instant submittedAt
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.userId = Objects.requireNonNull(userId, "userId");
        this.taskId = Objects.requireNonNull(taskId, "taskId");
        this.personaGenerationId = Objects.requireNonNull(
                personaGenerationId, "personaGenerationId");
        this.personaVersionId = Objects.requireNonNull(
                personaVersionId, "personaVersionId");
        this.predictionId = Objects.requireNonNull(predictionId, "predictionId");
        this.questionId = Objects.requireNonNull(questionId, "questionId");
        this.selectedOptionId = Objects.requireNonNull(
                selectedOptionId, "selectedOptionId");
        this.reasonSource = Objects.requireNonNull(reasonSource, "reasonSource");
        this.acceptedPredictedReasonId = acceptedPredictedReasonId;
        this.finalReason = normalizeReason(finalReason);
        this.submittedAt = Objects.requireNonNull(submittedAt, "submittedAt");
        validateReasonSource();
    }

    public static TaskSubmission create(
            TaskSubmissionId id,
            TaskUserId userId,
            Task task,
            TaskPrediction prediction,
            TaskPersonaGenerationId currentPersonaGenerationId,
            TaskPersonaVersionId currentPersonaVersionId,
            TaskSubmissionAnswerCommand answerCommand,
            Instant submittedAt
    ) {
        Objects.requireNonNull(task, "task");
        Objects.requireNonNull(prediction, "prediction");
        Objects.requireNonNull(answerCommand, "answerCommand");
        Objects.requireNonNull(submittedAt, "submittedAt");
        if (!task.isOpenAt(submittedAt)) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_TASK_NOT_OPEN",
                    "task.status",
                    "submission is allowed only while task is open");
        }
        validatePredictionIdentity(
                userId, task, prediction, currentPersonaGenerationId,
                currentPersonaVersionId);
        TaskQuestion question = validateChoice(task, answerCommand);
        return switch (answerCommand) {
            case AcceptTaskPredictedReason accepted -> createAiAccepted(
                    id, userId, task, prediction, currentPersonaGenerationId,
                    currentPersonaVersionId, question, accepted, submittedAt);
            case WriteTaskReason written -> new TaskSubmission(
                    id, userId, task.id(), currentPersonaGenerationId,
                    currentPersonaVersionId, prediction.id(), question.id(),
                    written.selectedOptionId(), TaskReasonSource.USER_WRITTEN,
                    null, written.reason(), submittedAt);
        };
    }

    public static TaskSubmission restore(
            TaskSubmissionId id,
            TaskUserId userId,
            Task task,
            TaskPrediction prediction,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskQuestionId questionId,
            TaskOptionId selectedOptionId,
            TaskReasonSource reasonSource,
            TaskPredictedReasonId acceptedPredictedReasonId,
            String finalReason,
            Instant submittedAt
    ) {
        Objects.requireNonNull(task, "task");
        Objects.requireNonNull(prediction, "prediction");
        validatePredictionIdentity(
                userId, task, prediction, personaGenerationId,
                personaVersionId);
        TaskQuestion question = requireTaskQuestion(task, questionId);
        requireTaskOption(question, selectedOptionId);
        if (reasonSource == TaskReasonSource.AI_ACCEPTED) {
            validateAcceptedReason(
                    prediction, selectedOptionId, acceptedPredictedReasonId);
        }
        return new TaskSubmission(
                id, userId, task.id(), personaGenerationId, personaVersionId,
                prediction.id(), questionId, selectedOptionId, reasonSource,
                acceptedPredictedReasonId, finalReason, submittedAt);
    }

    public TaskSubmissionId id() { return id; }
    public TaskUserId userId() { return userId; }
    public TaskId taskId() { return taskId; }
    public TaskPersonaGenerationId personaGenerationId() { return personaGenerationId; }
    public TaskPersonaVersionId personaVersionId() { return personaVersionId; }
    public TaskPredictionId predictionId() { return predictionId; }
    public TaskQuestionId questionId() { return questionId; }
    public TaskOptionId selectedOptionId() { return selectedOptionId; }
    public TaskReasonSource reasonSource() { return reasonSource; }
    public TaskPredictedReasonId acceptedPredictedReasonId() {
        return acceptedPredictedReasonId;
    }
    public String finalReason() { return finalReason; }
    public Instant submittedAt() { return submittedAt; }

    private static TaskSubmission createAiAccepted(
            TaskSubmissionId id,
            TaskUserId userId,
            Task task,
            TaskPrediction prediction,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskQuestion question,
            AcceptTaskPredictedReason accepted,
            Instant submittedAt
    ) {
        TaskPredictedReason reason = validateAcceptedReason(
                prediction,
                accepted.selectedOptionId(),
                accepted.predictedReasonId());
        return new TaskSubmission(
                id, userId, task.id(), personaGenerationId, personaVersionId,
                prediction.id(), question.id(), accepted.selectedOptionId(),
                TaskReasonSource.AI_ACCEPTED, reason.id(), reason.reason(),
                submittedAt);
    }

    private static TaskPredictedReason validateAcceptedReason(
            TaskPrediction prediction,
            TaskOptionId selectedOptionId,
            TaskPredictedReasonId predictedReasonId
    ) {
        if (prediction.status() != TaskPredictionStatus.SUCCEEDED) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE",
                    "prediction.status",
                    "AI reason requires succeeded prediction");
        }
        if (predictedReasonId == null) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_ACCEPTED_REASON_REQUIRED",
                    "acceptedPredictedReasonId",
                    "AI_ACCEPTED submission requires predicted reason ID");
        }
        TaskPredictedReason reason = prediction.predictedReason(predictedReasonId);
        if (!reason.optionId().equals(selectedOptionId)) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_REASON_OPTION_MISMATCH",
                    "acceptedPredictedReasonId",
                    "predicted reason belongs to another option");
        }
        return reason;
    }

    private static TaskQuestion validateChoice(
            Task task,
            TaskSubmissionAnswerCommand command
    ) {
        TaskQuestion question = requireTaskQuestion(task, command.questionId());
        requireTaskOption(question, command.selectedOptionId());
        return question;
    }

    private static TaskQuestion requireTaskQuestion(
            Task task,
            TaskQuestionId questionId
    ) {
        Objects.requireNonNull(questionId, "questionId");
        if (task.questions().size() != 1
                || !task.questions().getFirst().id().equals(questionId)) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_QUESTION_MISMATCH",
                    "questionId",
                    "question does not belong to the task");
        }
        return task.questions().getFirst();
    }

    private static void requireTaskOption(
            TaskQuestion question,
            TaskOptionId selectedOptionId
    ) {
        Objects.requireNonNull(selectedOptionId, "selectedOptionId");
        if (!question.hasOption(selectedOptionId)) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_OPTION_MISMATCH",
                    "selectedOptionId",
                    "selected option does not belong to the question");
        }
    }

    private static void validatePredictionIdentity(
            TaskUserId userId,
            Task task,
            TaskPrediction prediction,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(personaGenerationId, "personaGenerationId");
        Objects.requireNonNull(personaVersionId, "personaVersionId");
        if (!prediction.matches(
                userId, task.id(), personaGenerationId, personaVersionId)) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_PREDICTION_MISMATCH",
                    "predictionId",
                    "prediction user, task or persona version is stale");
        }
        if (!prediction.status().terminal()) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_PREDICTION_NOT_READY",
                    "prediction.status",
                    "prediction must be SUCCEEDED or FAILED");
        }
    }

    private void validateReasonSource() {
        if (reasonSource == TaskReasonSource.AI_ACCEPTED
                && acceptedPredictedReasonId == null) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_ACCEPTED_REASON_REQUIRED",
                    "acceptedPredictedReasonId",
                    "AI_ACCEPTED submission requires predicted reason ID");
        }
        if (reasonSource == TaskReasonSource.USER_WRITTEN
                && acceptedPredictedReasonId != null) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_ACCEPTED_REASON_NOT_ALLOWED",
                    "acceptedPredictedReasonId",
                    "USER_WRITTEN submission must not have predicted reason ID");
        }
    }

    private static String normalizeReason(String reason) {
        return TaskText.required(
                reason,
                MAX_REASON_LENGTH,
                "TASK_SUBMISSION_REASON",
                "finalReason");
    }
}
