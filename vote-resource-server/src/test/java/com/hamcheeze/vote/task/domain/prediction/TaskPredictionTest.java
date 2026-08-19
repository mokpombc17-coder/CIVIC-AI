package com.hamcheeze.vote.task.domain.prediction;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
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
    void predictedReasonAllowsOnlyTwoOrderedNonBlankReasonsPerOption() {
        assertThatThrownBy(() -> new TaskPredictedReason(
                candidateId(1), predictionId(), optionId(1),
                3, "세 번째 이유"))
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
    void succeedsOnlyWithExactlyTwoReasonsForEveryOption() {
        Task task = openTask();
        TaskPrediction prediction = pendingPrediction();
        assertThat(prediction.requestId()).isEqualTo(prediction.id());
        assertThat(prediction.startProcessing(
                RETRY_POLICY, NOW.plusSeconds(12))).isEqualTo(1);

        prediction.succeed(
                task, validCandidates(2), NOW.plusSeconds(20));

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.SUCCEEDED);
        assertThat(prediction.candidatePolicyVersion())
                .isEqualTo("candidate-policy-v1");
        assertThat(prediction.predictedReasons()).hasSize(4);
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

    private static TaskPrediction processingPrediction() {
        TaskPrediction prediction = pendingPrediction();
        prediction.startProcessing(RETRY_POLICY, NOW.plusSeconds(12));
        return prediction;
    }
}
