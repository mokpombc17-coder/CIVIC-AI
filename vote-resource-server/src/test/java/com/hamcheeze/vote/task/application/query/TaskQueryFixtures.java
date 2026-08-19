package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionError;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.submission.UserAnsweredTaskQuestion;
import com.hamcheeze.vote.task.domain.task.ShortTextConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import com.hamcheeze.vote.task.domain.task.TaskStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class TaskQueryFixtures {

    static final Instant NOW = Instant.parse("2026-08-18T03:00:00Z");
    static final TaskUserId USER = new TaskUserId("query-user");
    static final TaskPersonaGenerationId GENERATION =
            new TaskPersonaGenerationId(UUID.randomUUID());
    static final TaskPersonaVersionId VERSION =
            new TaskPersonaVersionId(UUID.randomUUID());
    static final TaskPersonaId PERSONA = new TaskPersonaId("persona-query");

    private TaskQueryFixtures() {
    }

    static Task openTask(String title, Instant closesAt) {
        Instant opensAt = NOW.minusSeconds(60);
        return Task.restore(
                new TaskId(UUID.randomUUID()),
                title,
                title + " 설명",
                List.of(question()),
                TaskStatus.OPEN,
                new TaskSchedule(opensAt, closesAt),
                NOW.minusSeconds(120),
                opensAt,
                null,
                null,
                NOW.minusSeconds(180),
                opensAt);
    }

    static Task scheduledTask(String title) {
        Instant opensAt = NOW.plusSeconds(600);
        return Task.restore(
                new TaskId(UUID.randomUUID()),
                title,
                null,
                List.of(question()),
                TaskStatus.SCHEDULED,
                new TaskSchedule(opensAt, opensAt.plusSeconds(600)),
                NOW.minusSeconds(30),
                null,
                null,
                null,
                NOW.minusSeconds(60),
                NOW.minusSeconds(30));
    }

    static Task closedTask(String title) {
        return Task.restore(
                new TaskId(UUID.randomUUID()),
                title,
                null,
                List.of(question()),
                TaskStatus.CLOSED,
                new TaskSchedule(NOW.minusSeconds(600), NOW.minusSeconds(60)),
                NOW.minusSeconds(700),
                NOW.minusSeconds(600),
                NOW.minusSeconds(60),
                TaskClosureType.DEADLINE_REACHED,
                NOW.minusSeconds(800),
                NOW.minusSeconds(60));
    }

    static Task draftTask(String title) {
        return Task.draft(
                new TaskId(UUID.randomUUID()), title, null,
                List.of(question()), NOW.minusSeconds(60));
    }

    static TaskPrediction pendingPrediction(Task task) {
        return TaskPrediction.pending(
                new TaskPredictionId(UUID.randomUUID()),
                USER,
                task.id(),
                GENERATION,
                VERSION,
                PERSONA,
                "policy-v1",
                2,
                NOW.minusSeconds(40));
    }

    static TaskPrediction succeededPrediction(Task task) {
        TaskPredictionId predictionId = new TaskPredictionId(UUID.randomUUID());
        TaskQuestionId questionId = task.questions().getFirst().id();
        List<TaskPredictionCandidate> candidates = List.of(
                new TaskPredictionCandidate(
                        new TaskPredictionCandidateId(UUID.randomUUID()),
                        predictionId,
                        questionId,
                        1,
                        new ShortTextValue("AI 예상 답변 1"),
                        "첫 번째 예상 근거"),
                new TaskPredictionCandidate(
                        new TaskPredictionCandidateId(UUID.randomUUID()),
                        predictionId,
                        questionId,
                        2,
                        new ShortTextValue("AI 예상 답변 2"),
                        "두 번째 예상 근거"));
        return TaskPrediction.restore(
                predictionId, USER, task, GENERATION, VERSION, PERSONA,
                "policy-v1", 2, TaskPredictionStatus.SUCCEEDED,
                1, candidates, null, null,
                NOW.minusSeconds(40), NOW.minusSeconds(30),
                NOW.minusSeconds(20));
    }

    static TaskPrediction failedPrediction(Task task) {
        return TaskPrediction.restore(
                new TaskPredictionId(UUID.randomUUID()),
                USER,
                task,
                GENERATION,
                VERSION,
                PERSONA,
                "policy-v1",
                2,
                TaskPredictionStatus.FAILED,
                1,
                List.of(),
                null,
                new TaskPredictionError("AI_TIMEOUT", "prediction timed out"),
                NOW.minusSeconds(40),
                NOW.minusSeconds(30),
                NOW.minusSeconds(20));
    }

    static TaskSubmission aiSubmission(
            Task task,
            TaskPrediction prediction
    ) {
        return TaskSubmission.create(
                new TaskSubmissionId(UUID.randomUUID()),
                USER,
                task,
                prediction,
                GENERATION,
                VERSION,
                List.of(new AcceptTaskPredictionCandidate(
                        task.questions().getFirst().id(),
                        prediction.candidates().getFirst().id())),
                NOW.minusSeconds(10));
    }

    static TaskSubmission directSubmission(
            Task task,
            TaskPrediction prediction
    ) {
        return TaskSubmission.create(
                new TaskSubmissionId(UUID.randomUUID()),
                USER,
                task,
                prediction,
                GENERATION,
                VERSION,
                List.of(new UserAnsweredTaskQuestion(
                        task.questions().getFirst().id(),
                        new ShortTextValue("사용자 직접 답변"))),
                NOW.minusSeconds(10));
    }

    private static TaskQuestion question() {
        return new TaskQuestion(
                new TaskQuestionId(UUID.randomUUID()),
                1,
                TaskQuestionType.SHORT_TEXT,
                "질문에 답해주세요.",
                null,
                ShortTextConstraint.defaults(),
                List.of());
    }
}
