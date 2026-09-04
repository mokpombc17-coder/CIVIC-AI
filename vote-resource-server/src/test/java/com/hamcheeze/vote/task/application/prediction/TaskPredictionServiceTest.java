package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionInputRepository;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionInputSnapshotFactory;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.failedPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.personaGenerationId;
import static com.hamcheeze.vote.task.TaskTestFixtures.personaId;
import static com.hamcheeze.vote.task.TaskTestFixtures.succeededPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.taskId;
import static com.hamcheeze.vote.task.TaskTestFixtures.userId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class TaskPredictionServiceTest {

    private TaskRepository tasks;
    private TaskPredictionRepository predictions;
    private CurrentTaskPersonaQueryPort currentPersonas;
    private TaskPredictionInputRepository inputs;
    private TaskPredictionInputSnapshotFactory inputSnapshots;
    private TaskPredictionService service;

    @BeforeEach
    void setUp() {
        tasks = mock(TaskRepository.class);
        predictions = mock(TaskPredictionRepository.class);
        inputs = mock(TaskPredictionInputRepository.class);
        inputSnapshots = mock(TaskPredictionInputSnapshotFactory.class);
        currentPersonas = mock(CurrentTaskPersonaQueryPort.class);
        TaskPredictionApplicationPolicy policy =
                new TaskPredictionApplicationPolicy(
                        "candidate-policy-v1",
                        new com.hamcheeze.vote.task.domain.prediction
                                .TaskPredictionRetryPolicy(
                                Duration.ofSeconds(60),
                                2,
                                Duration.ofSeconds(30)),
                        10);
        service = new TaskPredictionService(
                tasks,
                predictions,
                inputs,
                inputSnapshots,
                currentPersonas,
                policy,
                new TaskPredictionAvailability(true),
                Clock.fixed(NOW.plusSeconds(20), ZoneOffset.UTC));
        when(tasks.findById(taskId())).thenReturn(Optional.of(openTask()));
        when(currentPersonas.findCurrentUsable(userId())).thenReturn(
                Optional.of(new CurrentTaskPersona(
                        personaGenerationId(), personaId())));
        when(inputSnapshots.create(any(), any(), any()))
                .thenAnswer(invocation -> input(
                        invocation.<TaskPrediction>getArgument(0)));
        when(inputs.insert(any())).thenAnswer(
                invocation -> invocation.getArgument(0));
        when(inputs.findByPredictionId(any()))
                .thenAnswer(invocation -> Optional.of(
                        input(invocation.<TaskPredictionId>getArgument(0))));
        when(predictions.insertPendingIfAbsent(any())).thenReturn(true);
    }

    private TaskPredictionInputSnapshot input(TaskPrediction prediction) {
        return input(prediction.id());
    }

    private TaskPredictionInputSnapshot input(TaskPredictionId predictionId) {
        return TaskPredictionInputSnapshot.create(
                predictionId, taskId(), userId(), personaGenerationId(),
                personaId(),
                openTask().schedule().scheduledCloseAt(), 1,
                "candidate-policy-v1", "{}", NOW.plusSeconds(20));
    }

    @Test
    void disabledFeatureRejectsBeforeAnyPredictionStateIsCreated() {
        TaskPredictionService disabled = new TaskPredictionService(
                tasks, predictions, inputs, inputSnapshots,
                currentPersonas,
                new TaskPredictionApplicationPolicy(
                        "candidate-policy-v1",
                        new com.hamcheeze.vote.task.domain.prediction
                                .TaskPredictionRetryPolicy(
                                Duration.ofSeconds(60), 2,
                                Duration.ofSeconds(30)),
                        10),
                new TaskPredictionAvailability(false),
                Clock.fixed(NOW.plusSeconds(20), ZoneOffset.UTC));

        assertThatThrownBy(() -> disabled.ensureTaskPrediction(
                userId(), taskId()))
                .isInstanceOfSatisfying(TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo("TASK_PREDICTION_DISABLED"));
        verify(predictions, never()).insertPendingIfAbsent(any());
        verify(inputs, never()).insert(any());
        verifyNoInteractions(inputSnapshots);
    }

    @Test
    void createsOnePendingPredictionForOpenTaskAndCurrentPersona() {
        when(predictions.findByIdentity(
                userId(), taskId(), personaGenerationId()))
                .thenReturn(Optional.empty());
        EnsureTaskPredictionResult result =
                service.ensureTaskPrediction(userId(), taskId());

        assertThat(result.created()).isTrue();
        assertThat(result.predictedAnswerAllowed()).isFalse();
        assertThat(result.directAnswerAllowed()).isFalse();
        assertThat(result.prediction().requestId())
                .isEqualTo(result.prediction().id());
        assertThat(result.prediction().personaGenerationId())
                .isEqualTo(personaGenerationId());
    }

    @Test
    void resolvesConflictFreeInsertRaceToTheConcurrentWinner() {
        TaskPrediction winner = TaskPrediction.pending(
                new TaskPredictionId(UUID.randomUUID()),
                userId(), taskId(), personaGenerationId(),
                personaId(),
                "candidate-policy-v1", NOW.plusSeconds(20));
        when(predictions.findByIdentity(
                userId(), taskId(), personaGenerationId()))
                .thenReturn(Optional.empty(), Optional.of(winner));
        when(predictions.insertPendingIfAbsent(any(TaskPrediction.class)))
                .thenReturn(false);

        EnsureTaskPredictionResult result =
                service.ensureTaskPrediction(userId(), taskId());

        assertThat(result.created()).isFalse();
        assertThat(result.prediction().id()).isEqualTo(winner.id());
    }

    @Test
    void returnsTerminalFailureAsUnavailableWithoutRerun() {
        TaskPrediction failed = failedPrediction();
        when(predictions.findByIdentity(
                userId(), taskId(), personaGenerationId()))
                .thenReturn(Optional.of(failed));

        EnsureTaskPredictionResult result =
                service.ensureTaskPrediction(userId(), taskId());

        assertThat(result.created()).isFalse();
        assertThat(result.directAnswerAllowed()).isFalse();
        assertThat(result.predictedAnswerAllowed()).isFalse();
        verify(predictions, never()).insertPendingIfAbsent(any());
    }

    @Test
    void returnsTerminalSuccessAsCandidateOrDirectAnswerReady() {
        TaskPrediction succeeded = succeededPrediction(openTask());
        when(predictions.findByIdentity(
                userId(), taskId(), personaGenerationId()))
                .thenReturn(Optional.of(succeeded));

        EnsureTaskPredictionResult result =
                service.ensureTaskPrediction(userId(), taskId());

        assertThat(result.created()).isFalse();
        assertThat(result.predictedAnswerAllowed()).isTrue();
        assertThat(result.directAnswerAllowed()).isTrue();
        verify(predictions, never()).insertPendingIfAbsent(any());
    }

    @Test
    void exposesOnlyPredictionForTheCurrentPersonaGeneration() {
        TaskPersonaGenerationId nextGeneration =
                new TaskPersonaGenerationId(UUID.randomUUID());
        CurrentTaskPersona nextPersona = new CurrentTaskPersona(
                nextGeneration,
                new TaskPersonaId("persona-next"));
        TaskPrediction currentPrediction = TaskPrediction.pending(
                new TaskPredictionId(UUID.randomUUID()),
                userId(), taskId(), nextGeneration,
                nextPersona.personaId(),
                "candidate-policy-v1", NOW.plusSeconds(20));
        when(currentPersonas.findCurrentUsable(userId()))
                .thenReturn(Optional.of(nextPersona));
        when(predictions.findByIdentity(
                userId(), taskId(), nextGeneration))
                .thenReturn(Optional.of(currentPrediction));

        assertThat(service.findCurrentPrediction(userId(), taskId()))
                .contains(currentPrediction);
        verify(predictions, never()).findByIdentity(
                userId(), taskId(), personaGenerationId());
    }

    @Test
    void rejectsPredictionWhenCurrentPersonaIsNotReady() {
        when(currentPersonas.findCurrentUsable(userId()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() ->
                service.ensureTaskPrediction(userId(), taskId()))
                .isInstanceOf(TaskDomainException.class)
                .satisfies(exception -> assertThat(
                        ((TaskDomainException) exception)
                                .violation().code())
                        .isEqualTo("TASK_CURRENT_PERSONA_NOT_READY"));
        verify(predictions, never()).insertPendingIfAbsent(any());
    }
}
