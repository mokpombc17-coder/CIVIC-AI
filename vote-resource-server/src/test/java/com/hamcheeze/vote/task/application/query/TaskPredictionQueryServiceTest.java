package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionAvailability;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionError;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState.ALREADY_SUBMITTED;
import static com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState.FAILED;
import static com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState.NOT_REQUESTED;
import static com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState.PENDING;
import static com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState.PERSONA_NOT_READY;
import static com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState.SUCCEEDED;
import static com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState.TASK_CLOSED;
import static com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState.TASK_UNPUBLISHED;
import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.GENERATION;
import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.NOW;
import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.PERSONA;
import static com.hamcheeze.vote.task.application.query.TaskQueryFixtures.USER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaskPredictionQueryServiceTest {

    @Mock
    private TaskRepository tasks;

    @Mock
    private CurrentTaskPersonaQueryPort currentPersonas;

    @Mock
    private TaskPredictionRepository predictions;

    @Mock
    private TaskSubmissionRepository submissions;

    private TaskPredictionQueryService service;
    private Task task;

    @BeforeEach
    void setUp() {
        service = new TaskPredictionQueryService(
                tasks, currentPersonas, predictions, submissions,
                Clock.fixed(NOW, ZoneOffset.UTC));
        task = TaskQueryFixtures.openTask(
                "예측 조회 과업", NOW.plusSeconds(600));
    }

    @Test
    void reportsPersonaNotReadyWithoutTreatingItAsPredictionWaiting() {
        availableTask();
        when(currentPersonas.findCurrentUsable(USER))
                .thenReturn(Optional.empty());

        var view = service.findCurrent(USER, task.id());

        assertThat(view.state()).isEqualTo(PERSONA_NOT_READY);
        assertThat(view.waiting()).isFalse();
        assertThat(view.predictionRequestAllowed()).isFalse();
        assertThat(view.submissionAllowed()).isFalse();
    }

    @Test
    void allowsPredictionRequestWhenCurrentPersonaHasNoPrediction() {
        availableTaskAndPersona();
        when(predictions.findByIdentity(USER, task.id(), GENERATION))
                .thenReturn(Optional.empty());

        var view = service.findCurrent(USER, task.id());

        assertThat(view.state()).isEqualTo(NOT_REQUESTED);
        assertThat(view.predictionRequestAllowed()).isTrue();
        assertThat(view.personaGenerationId()).isEqualTo(GENERATION);
    }

    @Test
    void pendingPredictionIsExplicitlyWaitingAndNotSubmittable() {
        availableTaskAndPersona();
        TaskPrediction prediction = TaskQueryFixtures.pendingPrediction(task);
        when(predictions.findByIdentity(USER, task.id(), GENERATION))
                .thenReturn(Optional.of(prediction));

        var view = service.findCurrent(USER, task.id());

        assertThat(view.state()).isEqualTo(PENDING);
        assertThat(view.waiting()).isTrue();
        assertThat(view.submissionAllowed()).isTrue();
        assertThat(view.directAnswerAllowed()).isTrue();
        assertThat(view.allowedReasonSources())
                .containsExactly(TaskReasonSource.USER_WRITTEN);
    }

    @Test
    void succeededPredictionAllowsCandidateAcceptanceAndDirectAnswer() {
        availableTaskAndPersona();
        TaskPrediction prediction = TaskQueryFixtures
                .succeededPrediction(task);
        when(predictions.findByIdentity(USER, task.id(), GENERATION))
                .thenReturn(Optional.of(prediction));

        var view = service.findCurrent(USER, task.id());

        assertThat(view.state()).isEqualTo(SUCCEEDED);
        assertThat(view.waiting()).isFalse();
        assertThat(view.submissionAllowed()).isTrue();
        assertThat(view.predictedAnswerAllowed()).isTrue();
        assertThat(view.directAnswerAllowed()).isTrue();
        assertThat(view.allowedReasonSources()).containsExactly(
                TaskReasonSource.AI_ACCEPTED,
                TaskReasonSource.USER_WRITTEN);
        assertThat(view.predictedReasons()).hasSize(4);
    }

    @Test
    void finalFailureIsDirectAnswerReadyRatherThanWaiting() {
        availableTaskAndPersona();
        TaskPrediction prediction = TaskQueryFixtures.failedPrediction(task);
        when(predictions.findByIdentity(USER, task.id(), GENERATION))
                .thenReturn(Optional.of(prediction));

        var view = service.findCurrent(USER, task.id());

        assertThat(view.state()).isEqualTo(FAILED);
        assertThat(view.waiting()).isFalse();
        assertThat(view.submissionAllowed()).isTrue();
        assertThat(view.predictedAnswerAllowed()).isFalse();
        assertThat(view.directAnswerAllowed()).isTrue();
        assertThat(view.allowedReasonSources())
                .containsExactly(TaskReasonSource.USER_WRITTEN);
        assertThat(view.failureCode()).isEqualTo("AI_TIMEOUT");
    }

    @Test
    void existingSubmissionWinsBeforePersonaAndPredictionLookup() {
        availableTask();
        TaskPrediction failed = TaskQueryFixtures.failedPrediction(task);
        TaskSubmission submission = TaskQueryFixtures.directSubmission(
                task, failed);
        when(submissions.findByUserAndTask(USER, task.id()))
                .thenReturn(Optional.of(submission));

        var view = service.findCurrent(USER, task.id());

        assertThat(view.state()).isEqualTo(ALREADY_SUBMITTED);
        assertThat(view.submissionId()).isEqualTo(submission.id());
        assertThat(view.submissionAllowed()).isFalse();
    }

    @Test
    void distinguishesUnpublishedTaskFromMissingTask() {
        task = TaskQueryFixtures.draftTask("미공개 과업");
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));

        var view = service.findCurrent(USER, task.id());

        assertThat(view.state()).isEqualTo(TASK_UNPUBLISHED);
    }

    @Test
    void distinguishesClosedTaskFromUnpublishedTask() {
        task = TaskQueryFixtures.closedTask("마감 과업");
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));

        var view = service.findCurrent(USER, task.id());

        assertThat(view.state()).isEqualTo(TASK_CLOSED);
    }

    @Test
    void disabledFeatureHidesSucceededPredictionAcceptance() {
        availableTaskAndPersona();
        TaskPrediction prediction = TaskQueryFixtures
                .succeededPrediction(task);
        when(predictions.findByIdentity(USER, task.id(), GENERATION))
                .thenReturn(Optional.of(prediction));

        var view = service(false).findCurrent(USER, task.id());

        assertThat(view.predictionFeatureEnabled()).isFalse();
        assertThat(view.predictionUnavailableReason())
                .isEqualTo("TASK_PREDICTION_DISABLED");
        assertThat(view.waiting()).isFalse();
        assertThat(view.aiAcceptanceAllowed()).isFalse();
        assertThat(view.predictedAnswerAllowed()).isFalse();
        assertThat(view.directAnswerAllowed()).isTrue();
        assertThat(view.allowedReasonSources())
                .containsExactly(TaskReasonSource.USER_WRITTEN);
    }

    @Test
    void disabledFeatureDoesNotReportExistingNonTerminalAsWaitingOrRetrying() {
        availableTaskAndPersona();
        TaskPrediction retryWait = TaskQueryFixtures.pendingPrediction(task);
        TaskPredictionRetryPolicy retryPolicy = new TaskPredictionRetryPolicy(
                Duration.ofSeconds(5), 3, Duration.ofSeconds(10));
        retryWait.startProcessing(
                new TaskPredictionAttemptId(UUID.randomUUID()),
                retryPolicy, Duration.ofSeconds(30), NOW.minusSeconds(30));
        retryWait.failAttempt(
                new TaskPredictionError("AI_TIMEOUT", "timed out"),
                retryPolicy, NOW.minusSeconds(20));
        when(predictions.findByIdentity(USER, task.id(), GENERATION))
                .thenReturn(Optional.of(retryWait));

        var view = service(false).findCurrent(USER, task.id());

        assertThat(view.waiting()).isFalse();
        assertThat(view.nextRetryAt()).isNull();
        assertThat(view.retryable()).isFalse();
        assertThat(view.submissionAllowed()).isTrue();
        assertThat(view.directAnswerAllowed()).isTrue();
    }

    @Test
    void globalFeatureFlagRemainsEnabledWhenTaskIsClosed() {
        task = TaskQueryFixtures.closedTask("마감 과업");
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));

        var view = service(true).findCurrent(USER, task.id());

        assertThat(view.state()).isEqualTo(TASK_CLOSED);
        assertThat(view.predictionFeatureEnabled()).isTrue();
        assertThat(view.predictionRequestAllowed()).isFalse();
        assertThat(view.submissionAllowed()).isFalse();
    }

    private TaskPredictionQueryService service(boolean enabled) {
        return new TaskPredictionQueryService(
                tasks, currentPersonas, predictions, submissions,
                new TaskPredictionAvailability(enabled),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private void availableTask() {
        when(tasks.findById(task.id())).thenReturn(Optional.of(task));
        when(submissions.findByUserAndTask(USER, task.id()))
                .thenReturn(Optional.empty());
    }

    private void availableTaskAndPersona() {
        availableTask();
        when(currentPersonas.findCurrentUsable(USER))
                .thenReturn(Optional.of(new CurrentTaskPersona(
                        GENERATION, PERSONA)));
    }
}
