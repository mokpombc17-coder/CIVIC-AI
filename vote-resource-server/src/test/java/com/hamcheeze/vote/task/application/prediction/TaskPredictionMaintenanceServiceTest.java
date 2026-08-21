package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.actorId;
import static com.hamcheeze.vote.task.TaskTestFixtures.historyId;
import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.pendingPrediction;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TaskPredictionMaintenanceServiceTest {

    @Test
    void expiredProcessingLeaseEndsAttemptAndSchedulesFreshClaim() {
        TaskPrediction prediction = pendingPrediction();
        TaskPredictionAttemptId attemptId =
                new TaskPredictionAttemptId(UUID.randomUUID());
        var retry = new TaskPredictionRetryPolicy(
                Duration.ofSeconds(5), 2, Duration.ofSeconds(3));
        var startedAt = NOW.plusSeconds(20);
        prediction.startProcessing(
                attemptId, retry, Duration.ofSeconds(10), startedAt);
        TaskPredictionAttempt attempt = TaskPredictionAttempt.started(
                attemptId, prediction.id(), 1,
                SanitizedTaskPredictionPayload.fromSanitized("{}"),
                startedAt, startedAt.plusSeconds(10), "worker-a");

        TaskPredictionRepository predictions =
                mock(TaskPredictionRepository.class);
        TaskRepository tasks = mock(TaskRepository.class);
        AtomicReference<TaskPredictionAttempt> storedAttempt =
                new AtomicReference<>();
        when(predictions.findNextExpiredLeaseForUpdate(any()))
                .thenReturn(Optional.of(prediction));
        when(predictions.findAttempts(prediction.id()))
                .thenReturn(List.of(attempt));
        when(predictions.save(any(TaskPrediction.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(predictions.saveAttempt(any(TaskPredictionAttempt.class)))
                .thenAnswer(invocation -> {
                    TaskPredictionAttempt value = invocation.getArgument(0);
                    storedAttempt.set(value);
                    return value;
                });
        when(tasks.findById(prediction.taskId()))
                .thenReturn(Optional.of(openTask()));
        TaskPredictionMaintenanceService service =
                new TaskPredictionMaintenanceService(
                        predictions, tasks,
                        new TaskPredictionApplicationPolicy(
                                "candidate-policy-v1", retry,
                                Duration.ofSeconds(10), 10),
                        Clock.fixed(startedAt.plusSeconds(10),
                                ZoneOffset.UTC));

        assertThat(service.recoverNextExpiredLease()).isTrue();
        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.RETRY_WAIT);
        assertThat(prediction.activeAttemptId()).isNull();
        assertThat(prediction.nextRetryAt())
                .isEqualTo(startedAt.plusSeconds(13));
        assertThat(storedAttempt.get().outcome())
                .isEqualTo(TaskPredictionAttemptOutcome.LEASE_EXPIRED);
    }

    @Test
    void earlyClosedTaskImmediatelyFailsProcessingPredictionAndFencesReply() {
        TaskPrediction prediction = pendingPrediction();
        TaskPredictionAttemptId attemptId =
                new TaskPredictionAttemptId(UUID.randomUUID());
        var retry = new TaskPredictionRetryPolicy(
                Duration.ofSeconds(5), 2, Duration.ofSeconds(3));
        var startedAt = NOW.plusSeconds(20);
        prediction.startProcessing(
                attemptId, retry, Duration.ofSeconds(10), startedAt);
        TaskPredictionAttempt attempt = TaskPredictionAttempt.started(
                attemptId, prediction.id(), 1,
                SanitizedTaskPredictionPayload.fromSanitized("{}"),
                startedAt, startedAt.plusSeconds(10), "worker-a");
        var closedTask = openTask();
        closedTask.closeEarly(
                historyId(99), actorId(), "early close",
                startedAt.plusSeconds(1));

        TaskPredictionRepository predictions =
                mock(TaskPredictionRepository.class);
        TaskRepository tasks = mock(TaskRepository.class);
        AtomicReference<TaskPredictionAttempt> storedAttempt =
                new AtomicReference<>();
        when(predictions.findNextDeadlineExpiredForUpdate(any()))
                .thenReturn(Optional.of(prediction));
        when(predictions.findAttempts(prediction.id()))
                .thenReturn(List.of(attempt));
        when(predictions.save(any(TaskPrediction.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(predictions.saveAttempt(any(TaskPredictionAttempt.class)))
                .thenAnswer(invocation -> {
                    TaskPredictionAttempt value = invocation.getArgument(0);
                    storedAttempt.set(value);
                    return value;
                });
        when(tasks.findById(prediction.taskId()))
                .thenReturn(Optional.of(closedTask));
        TaskPredictionMaintenanceService service =
                new TaskPredictionMaintenanceService(
                        predictions, tasks,
                        new TaskPredictionApplicationPolicy(
                                "candidate-policy-v1", retry,
                                Duration.ofSeconds(10), 10),
                        Clock.fixed(startedAt.plusSeconds(2),
                                ZoneOffset.UTC));

        assertThat(service.expireNextDeadline()).isTrue();
        assertThat(prediction.status()).isEqualTo(TaskPredictionStatus.FAILED);
        assertThat(prediction.lastError().code())
                .isEqualTo("TASK_PREDICTION_TASK_CLOSED");
        assertThat(prediction.activeAttemptId()).isNull();
        assertThat(storedAttempt.get().outcome())
                .isEqualTo(TaskPredictionAttemptOutcome
                        .IGNORED_LATE_RESPONSE);
        assertThat(storedAttempt.get().errorCode())
                .isEqualTo("TASK_PREDICTION_TASK_CLOSED");
    }
}
