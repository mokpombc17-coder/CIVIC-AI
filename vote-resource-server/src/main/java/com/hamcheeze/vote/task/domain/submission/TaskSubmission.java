package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class TaskSubmission {

    private final TaskSubmissionId id;
    private final TaskUserId userId;
    private final TaskId taskId;
    private final TaskPersonaGenerationId personaGenerationId;
    private final TaskPersonaVersionId personaVersionId;
    private final TaskPredictionId predictionId;
    private final List<TaskSubmissionAnswer> answers;
    private final Instant submittedAt;

    private TaskSubmission(
            TaskSubmissionId id,
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            TaskPredictionId predictionId,
            List<TaskSubmissionAnswer> answers,
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
        this.answers = immutableAnswers(answers);
        this.submittedAt = Objects.requireNonNull(submittedAt, "submittedAt");
    }

    public static TaskSubmission create(
            TaskSubmissionId id,
            TaskUserId userId,
            Task task,
            TaskPrediction prediction,
            TaskPersonaGenerationId currentPersonaGenerationId,
            TaskPersonaVersionId currentPersonaVersionId,
            List<TaskSubmissionAnswerCommand> answerCommands,
            Instant submittedAt
    ) {
        Objects.requireNonNull(task, "task");
        Objects.requireNonNull(prediction, "prediction");
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
        List<TaskSubmissionAnswer> answers = createAnswers(
                task, prediction, answerCommands);
        return new TaskSubmission(
                id, userId, task.id(), currentPersonaGenerationId,
                currentPersonaVersionId, prediction.id(), answers,
                submittedAt);
    }

    public static TaskSubmission restore(
            TaskSubmissionId id,
            TaskUserId userId,
            Task task,
            TaskPrediction prediction,
            TaskPersonaGenerationId personaGenerationId,
            TaskPersonaVersionId personaVersionId,
            List<TaskSubmissionAnswer> storedAnswers,
            Instant submittedAt
    ) {
        Objects.requireNonNull(task, "task");
        Objects.requireNonNull(prediction, "prediction");
        validatePredictionIdentity(
                userId, task, prediction, personaGenerationId,
                personaVersionId);
        List<TaskSubmissionAnswer> answers = validateStoredAnswers(
                task, prediction, storedAnswers);
        return new TaskSubmission(
                id, userId, task.id(), personaGenerationId,
                personaVersionId, prediction.id(), answers, submittedAt);
    }

    public TaskSubmissionId id() { return id; }
    public TaskUserId userId() { return userId; }
    public TaskId taskId() { return taskId; }
    public TaskPersonaGenerationId personaGenerationId() { return personaGenerationId; }
    public TaskPersonaVersionId personaVersionId() { return personaVersionId; }
    public TaskPredictionId predictionId() { return predictionId; }
    public List<TaskSubmissionAnswer> answers() { return answers; }
    public Instant submittedAt() { return submittedAt; }

    private static List<TaskSubmissionAnswer> createAnswers(
            Task task,
            TaskPrediction prediction,
            List<TaskSubmissionAnswerCommand> commands
    ) {
        Map<TaskQuestionId, TaskSubmissionAnswerCommand> byQuestion =
                indexCommands(task, commands);
        List<TaskSubmissionAnswer> answers = new ArrayList<>();
        for (TaskQuestion question : task.questions()) {
            TaskSubmissionAnswerCommand command = byQuestion.get(question.id());
            TaskSubmissionAnswer answer = switch (command) {
                case AcceptTaskPredictionCandidate accepted ->
                        acceptCandidate(question, prediction, accepted);
                case UserAnsweredTaskQuestion direct ->
                        TaskSubmissionAnswer.userAnswered(
                                question.id(),
                                question.validateAndNormalize(
                                        direct.answerValue()));
            };
            answers.add(answer);
        }
        if (prediction.status() == TaskPredictionStatus.FAILED
                && answers.stream().anyMatch(answer ->
                answer.source() == TaskAnswerSource.AI_ACCEPTED)) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_FAILED_PREDICTION_REQUIRES_DIRECT_ANSWERS",
                    "answers",
                    "failed prediction permits only USER_ANSWERED answers");
        }
        return List.copyOf(answers);
    }

    private static TaskSubmissionAnswer acceptCandidate(
            TaskQuestion question,
            TaskPrediction prediction,
            AcceptTaskPredictionCandidate accepted
    ) {
        if (prediction.status() != TaskPredictionStatus.SUCCEEDED) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE",
                    "prediction.status",
                    "AI candidate requires succeeded prediction");
        }
        TaskPredictionCandidate candidate = prediction.candidate(
                accepted.candidateId());
        if (!candidate.questionId().equals(question.id())) {
            throw TaskDomainException.invariant(
                    "TASK_SUBMISSION_CANDIDATE_QUESTION_MISMATCH",
                    "candidateId",
                    "candidate belongs to another question");
        }
        TaskAnswerValue exactAnswer = question.validateAndNormalize(
                candidate.answerValue());
        return TaskSubmissionAnswer.aiAccepted(
                question.id(), candidate.id(), exactAnswer);
    }

    private static List<TaskSubmissionAnswer> validateStoredAnswers(
            Task task,
            TaskPrediction prediction,
            List<TaskSubmissionAnswer> storedAnswers
    ) {
        Objects.requireNonNull(storedAnswers, "storedAnswers");
        Map<TaskQuestionId, TaskSubmissionAnswer> byQuestion = new HashMap<>();
        for (TaskSubmissionAnswer answer : storedAnswers) {
            Objects.requireNonNull(answer, "stored answer");
            if (byQuestion.put(answer.questionId(), answer) != null) {
                throw invalidAnswerSet(
                        "TASK_SUBMISSION_ANSWER_DUPLICATED",
                        "duplicate answer for question");
            }
        }
        requireExactQuestionSet(task, byQuestion.keySet());
        List<TaskSubmissionAnswer> normalized = new ArrayList<>();
        for (TaskQuestion question : task.questions()) {
            TaskSubmissionAnswer stored = byQuestion.get(question.id());
            TaskAnswerValue answer = question.validateAndNormalize(
                    stored.finalAnswerValue());
            if (stored.source() == TaskAnswerSource.AI_ACCEPTED) {
                if (prediction.status() != TaskPredictionStatus.SUCCEEDED) {
                    throw invalidAnswerSet(
                            "TASK_SUBMISSION_AI_ACCEPTANCE_NOT_AVAILABLE",
                            "AI answer requires succeeded prediction");
                }
                TaskPredictionCandidate candidate = prediction.candidate(
                        stored.adoptedPredictionCandidateId());
                if (!candidate.questionId().equals(question.id())
                        || !candidate.answerValue().equals(answer)) {
                    throw invalidAnswerSet(
                            "TASK_SUBMISSION_AI_ANSWER_CHANGED",
                            "stored AI answer must equal adopted candidate");
                }
                normalized.add(TaskSubmissionAnswer.aiAccepted(
                        question.id(), candidate.id(), answer));
            } else {
                normalized.add(TaskSubmissionAnswer.userAnswered(
                        question.id(), answer));
            }
        }
        return List.copyOf(normalized);
    }

    private static Map<TaskQuestionId, TaskSubmissionAnswerCommand> indexCommands(
            Task task,
            List<TaskSubmissionAnswerCommand> commands
    ) {
        Objects.requireNonNull(commands, "answerCommands");
        Map<TaskQuestionId, TaskSubmissionAnswerCommand> byQuestion =
                new HashMap<>();
        for (TaskSubmissionAnswerCommand command : commands) {
            Objects.requireNonNull(command, "answer command");
            if (byQuestion.put(command.questionId(), command) != null) {
                throw invalidAnswerSet(
                        "TASK_SUBMISSION_ANSWER_DUPLICATED",
                        "duplicate answer for question");
            }
        }
        requireExactQuestionSet(task, byQuestion.keySet());
        return byQuestion;
    }

    private static void requireExactQuestionSet(
            Task task,
            Set<TaskQuestionId> answerQuestionIds
    ) {
        Set<TaskQuestionId> taskQuestionIds = new HashSet<>();
        task.questions().forEach(question ->
                taskQuestionIds.add(question.id()));
        if (!answerQuestionIds.equals(taskQuestionIds)) {
            throw invalidAnswerSet(
                    "TASK_SUBMISSION_ANSWER_SET_INCOMPLETE",
                    "answers must cover every task question exactly once");
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

    private static List<TaskSubmissionAnswer> immutableAnswers(
            List<TaskSubmissionAnswer> answers
    ) {
        Objects.requireNonNull(answers, "answers");
        if (answers.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "answers must not contain null");
        }
        return List.copyOf(answers);
    }

    private static TaskDomainException invalidAnswerSet(
            String code,
            String message
    ) {
        return TaskDomainException.invariant(code, "answers", message);
    }
}
