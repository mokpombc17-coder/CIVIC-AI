package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.RETRY_POLICY;
import static com.hamcheeze.vote.task.TaskTestFixtures.candidate;
import static com.hamcheeze.vote.task.TaskTestFixtures.candidateId;
import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.pendingPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.predictionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.questionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.validCandidates;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskPredictionTest {

    @Test
    void succeedsOnlyWithCompleteCandidatesForPolicySnapshot() {
        Task task = openTask();
        TaskPrediction prediction = pendingPrediction(3);
        assertThat(prediction.requestId()).isEqualTo(prediction.id());
        assertThat(prediction.startProcessing(
                RETRY_POLICY, NOW.plusSeconds(12))).isEqualTo(1);

        prediction.succeed(
                task, validCandidates(3), NOW.plusSeconds(20));

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.SUCCEEDED);
        assertThat(prediction.candidatePolicyVersion())
                .isEqualTo("candidate-policy-v1");
        assertThat(prediction.requestedCandidateCount()).isEqualTo(3);
        assertThat(prediction.candidates()).hasSize(6);
        assertThatThrownBy(() -> prediction.candidates().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> prediction.failPermanently(
                new TaskPredictionError("LATE", null),
                NOW.plusSeconds(30)))
                .isInstanceOf(TaskDomainException.class);
    }

    @Test
    void rejectsPartialDuplicateAndInvalidCandidateSetsAtomically() {
        Task task = openTask();
        TaskPrediction partial = processingPrediction(2);
        List<TaskPredictionCandidate> missing = new ArrayList<>(
                validCandidates(2));
        missing.removeLast();

        assertThatThrownBy(() -> partial.succeed(
                task, missing, NOW.plusSeconds(20)))
                .isInstanceOf(TaskDomainException.class);
        assertThat(partial.status())
                .isEqualTo(TaskPredictionStatus.PROCESSING);
        assertThat(partial.candidates()).isEmpty();

        TaskPrediction duplicate = processingPrediction(2);
        List<TaskPredictionCandidate> duplicated = new ArrayList<>(
                validCandidates(2));
        TaskPredictionCandidate existing = duplicated.getFirst();
        duplicated.set(1, new TaskPredictionCandidate(
                candidateId(99), predictionId(), existing.questionId(),
                2, existing.answerValue(), existing.rationale()));
        assertThatThrownBy(() -> duplicate.succeed(
                task, duplicated, NOW.plusSeconds(20)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_PREDICTION_CANDIDATE_DUPLICATED"));

        TaskPrediction invalid = processingPrediction(2);
        List<TaskPredictionCandidate> wrongType = new ArrayList<>(
                validCandidates(2));
        wrongType.set(0, candidate(
                100, questionId(1), 1,
                new ShortTextValue("잘못된 유형"), "이유"));
        assertThatThrownBy(() -> invalid.succeed(
                task, wrongType, NOW.plusSeconds(20)))
                .isInstanceOf(
                        com.hamcheeze.vote.task.domain.common.TaskValidationException.class);
    }

    @Test
    void retriesWithSameRequestIdAndBecomesTerminalAfterMaximumAttempts() {
        TaskPrediction prediction = pendingPrediction(2);
        var requestId = prediction.requestId();
        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(12));
        prediction.failAttempt(
                new TaskPredictionError("TIMEOUT", "60 seconds"),
                RETRY_POLICY, NOW.plusSeconds(72));

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.RETRY_WAIT);
        assertThat(prediction.nextRetryAt())
                .isEqualTo(NOW.plusSeconds(102));
        assertThatThrownBy(() -> prediction.startProcessing(
                RETRY_POLICY, NOW.plusSeconds(101)))
                .isInstanceOf(TaskDomainException.class);

        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(102));
        assertThat(prediction.requestId()).isEqualTo(requestId);
        prediction.failAttempt(
                new TaskPredictionError("TIMEOUT", "again"),
                RETRY_POLICY, NOW.plusSeconds(162));

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.FAILED);
        assertThat(prediction.attemptCount()).isEqualTo(2);
        assertThatThrownBy(() -> prediction.startProcessing(
                RETRY_POLICY, NOW.plusSeconds(200)))
                .isInstanceOf(TaskDomainException.class);
    }

    @Test
    void completedAttemptIsImmutableAndUsesPredictionAsRequestId() {
        SanitizedTaskPredictionPayload request =
                SanitizedTaskPredictionPayload.fromSanitized("{request}");
        TaskPredictionAttempt started = TaskPredictionAttempt.started(
                com.hamcheeze.vote.task.TaskTestFixtures.attemptId(1),
                predictionId(), 1, request, NOW);
        TaskPredictionAttempt completed = started.complete(
                TaskPredictionAttemptOutcome.SUCCEEDED,
                200,
                SanitizedTaskPredictionPayload.fromSanitized("{response}"),
                null, null, NOW.plusSeconds(1));

        assertThat(completed.requestId()).isEqualTo(predictionId());
        assertThat(completed.outcome())
                .isEqualTo(TaskPredictionAttemptOutcome.SUCCEEDED);
        assertThatThrownBy(() -> completed.complete(
                TaskPredictionAttemptOutcome.IGNORED_LATE_RESPONSE,
                200, SanitizedTaskPredictionPayload.fromSanitized("{}"),
                null, null, NOW.plusSeconds(2)))
                .isInstanceOf(TaskDomainException.class);
    }

    @Test
    void lateSuccessDuringRetryWaitDoesNotChangePrediction() {
        TaskPrediction prediction = pendingPrediction(2);
        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(12));
        prediction.failAttempt(
                new TaskPredictionError("TIMEOUT", null),
                RETRY_POLICY, NOW.plusSeconds(72));

        assertThatThrownBy(() -> prediction.succeed(
                openTask(), validCandidates(2), NOW.plusSeconds(80)))
                .isInstanceOf(TaskDomainException.class);
        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.RETRY_WAIT);
        assertThat(prediction.candidates()).isEmpty();
    }

    private static TaskPrediction processingPrediction(int candidateCount) {
        TaskPrediction prediction = pendingPrediction(candidateCount);
        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(12));
        return prediction;
    }
}
