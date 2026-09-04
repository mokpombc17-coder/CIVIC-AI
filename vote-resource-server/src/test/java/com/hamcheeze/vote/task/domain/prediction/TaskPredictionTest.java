package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.time.Duration;
import java.util.List;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.RETRY_POLICY;
import static com.hamcheeze.vote.task.TaskTestFixtures.candidateId;
import static com.hamcheeze.vote.task.TaskTestFixtures.optionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.pendingPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.predictionId;
import static com.hamcheeze.vote.task.TaskTestFixtures.validCandidates;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskPredictionTest {

    @Test
    void predictedReasonAllowsUpToFiveOrderedNonBlankReasonsPerOption() {
        assertThatThrownBy(() -> new TaskPredictedReason(
                candidateId(1), predictionId(), optionId(1),
                6, "여섯 번째 이유"))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_PREDICTED_REASON_ORDER_INVALID"));
        assertThatThrownBy(() -> new TaskPredictedReason(
                candidateId(1), predictionId(), optionId(1),
                1, " "))
                .isInstanceOf(TaskDomainException.class);
    }

    @Test
    void succeedsWithAtLeastTwoContinuousReasonsForEveryOption() {
        Task task = openTask();
        TaskPrediction prediction = pendingPrediction();
        assertThat(prediction.requestId()).isEqualTo(prediction.id());
        assertThat(prediction.startProcessing(
                RETRY_POLICY, NOW.plusSeconds(12))).isEqualTo(1);

        prediction.succeed(
                task, validCandidates(3), NOW.plusSeconds(20));

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.SUCCEEDED);
        assertThat(prediction.candidatePolicyVersion())
                .isEqualTo("candidate-policy-v1");
        assertThat(prediction.predictedReasons()).hasSize(6);
        assertThatThrownBy(() -> prediction.predictedReasons().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> prediction.failPermanently(
                new TaskPredictionError("LATE", null),
                NOW.plusSeconds(30)))
                .isInstanceOf(TaskDomainException.class);
    }

    @Test
    void rejectsPartialDuplicateAndInvalidCandidateSetsAtomically() {
        Task task = openTask();
        TaskPrediction partial = processingPrediction();
        List<TaskPredictedReason> missing = new ArrayList<>(
                validCandidates(2));
        missing.removeLast();

        assertThatThrownBy(() -> partial.succeed(
                task, missing, NOW.plusSeconds(20)))
                .isInstanceOf(TaskDomainException.class);
        assertThat(partial.status())
                .isEqualTo(TaskPredictionStatus.PROCESSING);
        assertThat(partial.predictedReasons()).isEmpty();

        TaskPrediction duplicate = processingPrediction();
        List<TaskPredictedReason> duplicated = new ArrayList<>(
                validCandidates(2));
        TaskPredictedReason existing = duplicated.getFirst();
        duplicated.set(1, new TaskPredictedReason(
                candidateId(99), predictionId(), existing.optionId(),
                2, existing.reason()));
        assertThatThrownBy(() -> duplicate.succeed(
                task, duplicated, NOW.plusSeconds(20)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_PREDICTED_REASON_DUPLICATED"));

        TaskPrediction invalid = processingPrediction();
        List<TaskPredictedReason> wrongOption = new ArrayList<>(
                validCandidates(2));
        wrongOption.set(0, new TaskPredictedReason(
                candidateId(100), predictionId(), optionId(99),
                1, "잘못된 선택지 이유"));
        assertThatThrownBy(() -> invalid.succeed(
                task, wrongOption, NOW.plusSeconds(20)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_PREDICTED_REASON_OPTION_MISMATCH"));
    }

    @Test
    void rejectsNonContinuousReasonOrders() {
        TaskPrediction prediction = processingPrediction();
        List<TaskPredictedReason> reasons = new ArrayList<>(
                validCandidates(2));
        TaskPredictedReason firstOptionSecondReason = reasons.get(1);
        reasons.set(1, new TaskPredictedReason(
                firstOptionSecondReason.id(),
                firstOptionSecondReason.predictionId(),
                firstOptionSecondReason.optionId(),
                3,
                firstOptionSecondReason.reason()));

        assertThatThrownBy(() -> prediction.succeed(
                openTask(), reasons, NOW.plusSeconds(20)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "TASK_PREDICTED_REASON_ORDER_INVALID"));
    }

    @Test
    void retriesWithSameRequestIdAndBecomesTerminalAfterMaximumAttempts() {
        TaskPrediction prediction = pendingPrediction();
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
    void remoteProcessingWaitsForDemandAndDoesNotConsumeFailureRetryBudget() {
        TaskPrediction prediction = pendingPrediction();
        TaskPredictionRuntimeStatus remoteStatus =
                new TaskPredictionRuntimeStatus(
                        "PREDICTION_NOT_READY",
                        "AI 예상 이유를 준비 중입니다.",
                        true,
                        10);

        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(12));
        prediction.markRemoteProcessing(
                remoteStatus, Duration.ofSeconds(30), NOW.plusSeconds(20));

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.REMOTE_PROCESSING);
        assertThat(prediction.runtimeStatus()).isEqualTo(remoteStatus);
        assertThat(prediction.requestRemoteRecheck(NOW.plusSeconds(49)))
                .isFalse();
        assertThat(prediction.requestRemoteRecheck(NOW.plusSeconds(50)))
                .isTrue();

        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(50));
        prediction.markRemoteProcessing(
                remoteStatus, Duration.ZERO, NOW.plusSeconds(51));
        assertThat(prediction.requestRemoteRecheck(NOW.plusSeconds(51)))
                .isTrue();

        assertThat(prediction.startProcessing(
                RETRY_POLICY, NOW.plusSeconds(51))).isEqualTo(3);
        assertThat(prediction.runtimeStatus()).isNull();
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
        TaskPrediction prediction = pendingPrediction();
        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(12));
        prediction.failAttempt(
                new TaskPredictionError("TIMEOUT", null),
                RETRY_POLICY, NOW.plusSeconds(72));

        assertThatThrownBy(() -> prediction.succeed(
                openTask(), validCandidates(2), NOW.plusSeconds(80)))
                .isInstanceOf(TaskDomainException.class);
        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.RETRY_WAIT);
        assertThat(prediction.predictedReasons()).isEmpty();
    }

    @Test
    void pendingPredictionClosedBeforeProcessingGetsConsistentTerminalTimestamps() {
        TaskPrediction prediction = pendingPrediction();
        var closedAt = NOW.plusSeconds(15);

        prediction.failDeadline(
                new TaskPredictionError(
                        "TASK_PREDICTION_TASK_CLOSED",
                        "task closed before prediction processing"),
                closedAt);

        assertThat(prediction.status()).isEqualTo(TaskPredictionStatus.FAILED);
        assertThat(prediction.startedAt()).isEqualTo(closedAt);
        assertThat(prediction.completedAt()).isEqualTo(closedAt);
    }

    private static TaskPrediction processingPrediction() {
        TaskPrediction prediction = pendingPrediction();
        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(12));
        return prediction;
    }
}
