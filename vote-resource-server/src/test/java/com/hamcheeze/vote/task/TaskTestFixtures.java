package com.hamcheeze.vote.task;

import com.hamcheeze.vote.task.domain.answer.MultipleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionError;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;
import com.hamcheeze.vote.task.domain.task.MultipleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.ShortTextConstraint;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public final class TaskTestFixtures {

    public static final Instant NOW =
            Instant.parse("2026-01-01T00:00:00Z");
    public static final TaskPredictionRetryPolicy RETRY_POLICY =
            new TaskPredictionRetryPolicy(
                    Duration.ofSeconds(60), 2, Duration.ofSeconds(30));

    private TaskTestFixtures() {
    }

    public static TaskId taskId() { return new TaskId(uuid(1, 1)); }
    public static TaskQuestionId questionId(int sequence) {
        return new TaskQuestionId(uuid(2, sequence));
    }
    public static TaskOptionId optionId(int sequence) {
        return new TaskOptionId(uuid(3, sequence));
    }
    public static TaskPredictionId predictionId() {
        return new TaskPredictionId(uuid(4, 1));
    }
    public static TaskPredictionCandidateId candidateId(int sequence) {
        return new TaskPredictionCandidateId(uuid(5, sequence));
    }
    public static TaskPredictionAttemptId attemptId(int sequence) {
        return new TaskPredictionAttemptId(uuid(6, sequence));
    }
    public static TaskSubmissionId submissionId() {
        return new TaskSubmissionId(uuid(7, 1));
    }
    public static TaskLifecycleHistoryId historyId(int sequence) {
        return new TaskLifecycleHistoryId(uuid(8, sequence));
    }
    public static TaskUserId userId() { return new TaskUserId("user-a"); }
    public static TaskActorId actorId() { return new TaskActorId("admin-a"); }
    public static TaskPersonaGenerationId personaGenerationId() {
        return new TaskPersonaGenerationId(uuid(9, 1));
    }
    public static TaskPersonaVersionId personaVersionId() {
        return new TaskPersonaVersionId(uuid(9, 2));
    }
    public static TaskPersonaId personaId() {
        return new TaskPersonaId("persona-a");
    }

    public static TaskQuestion singleQuestion() {
        return new TaskQuestion(
                questionId(1), 1, TaskQuestionType.SINGLE_CHOICE,
                "하나를 선택하세요", null,
                new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(optionId(1), 1, "A"),
                        TaskOption.standard(optionId(2), 2, "B")));
    }

    public static TaskQuestion multipleQuestion() {
        return new TaskQuestion(
                questionId(2), 2, TaskQuestionType.MULTIPLE_CHOICE,
                "여러 개를 선택하세요", null,
                new MultipleChoiceConstraint(1, 3),
                List.of(
                        TaskOption.standard(optionId(3), 1, "C"),
                        TaskOption.standard(optionId(4), 2, "D"),
                        TaskOption.standard(optionId(5), 3, "E")));
    }

    public static TaskQuestion shortTextQuestion() {
        return new TaskQuestion(
                questionId(3), 3, TaskQuestionType.SHORT_TEXT,
                "한 줄로 답하세요", null,
                ShortTextConstraint.defaults(), List.of());
    }

    public static Task draftTask() {
        return Task.draft(
                taskId(), "테스트 과업", "설명",
                List.of(singleQuestion(), multipleQuestion(),
                        shortTextQuestion()),
                NOW);
    }

    public static Task openTask() {
        Task task = draftTask();
        task.openImmediately(
                historyId(1), NOW.plusSeconds(3_600), actorId(),
                null, NOW.plusSeconds(10));
        return task;
    }

    public static TaskPrediction pendingPrediction(int candidateCount) {
        return TaskPrediction.pending(
                predictionId(), userId(), taskId(), personaGenerationId(),
                personaVersionId(), personaId(), "candidate-policy-v1",
                candidateCount,
                NOW.plusSeconds(11));
    }

    public static TaskPrediction succeededPrediction(Task task) {
        TaskPrediction prediction = pendingPrediction(2);
        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(12));
        prediction.succeed(task, validCandidates(2), NOW.plusSeconds(20));
        return prediction;
    }

    public static TaskPrediction failedPrediction() {
        TaskPrediction prediction = pendingPrediction(2);
        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(12));
        prediction.failPermanently(
                new TaskPredictionError("AI_REJECTED", "invalid request"),
                NOW.plusSeconds(20));
        return prediction;
    }

    public static List<TaskPredictionCandidate> validCandidates(int count) {
        List<TaskPredictionCandidate> candidates = new ArrayList<>();
        int id = 1;
        for (int order = 1; order <= count; order++) {
            candidates.add(candidate(
                    id++, questionId(1), order,
                    new SingleChoiceValue(
                            new TaskOptionSelection(optionId(1), null)),
                    "A 이유 " + order));
        }
        for (int order = 1; order <= count; order++) {
            candidates.add(candidate(
                    id++, questionId(1), order,
                    new SingleChoiceValue(
                            new TaskOptionSelection(optionId(2), null)),
                    "B 이유 " + order));
        }
        for (int order = 1; order <= count; order++) {
            List<TaskOptionSelection> selections = order % 2 == 1
                    ? List.of(new TaskOptionSelection(optionId(3), null))
                    : List.of(
                            new TaskOptionSelection(optionId(4), null),
                            new TaskOptionSelection(optionId(5), null));
            candidates.add(candidate(
                    id++, questionId(2), order,
                    new MultipleChoiceValue(selections),
                    "복수 이유 " + order));
        }
        for (int order = 1; order <= count; order++) {
            candidates.add(candidate(
                    id++, questionId(3), order,
                    new ShortTextValue("예상 " + order),
                    "텍스트 이유 " + order));
        }
        return candidates;
    }

    public static TaskPredictionCandidate candidate(
            int idSequence,
            TaskQuestionId questionId,
            int order,
            com.hamcheeze.vote.task.domain.answer.TaskAnswerValue answer,
            String rationale
    ) {
        return new TaskPredictionCandidate(
                candidateId(idSequence), predictionId(), questionId,
                order, answer, rationale);
    }

    private static UUID uuid(long high, long low) {
        return new UUID(high, low);
    }
}
