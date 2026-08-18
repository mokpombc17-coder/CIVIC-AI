package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
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
import static com.hamcheeze.vote.task.TaskTestFixtures.taskId;
import static com.hamcheeze.vote.task.TaskTestFixtures.userId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskPredictionServiceTest {

    private TaskRepository tasks;
    private TaskPredictionRepository predictions;
    private CurrentTaskPersonaQueryPort currentPersonas;
    private TaskPredictionService service;

    @BeforeEach
    void setUp() {
        tasks = mock(TaskRepository.class);
        predictions = mock(TaskPredictionRepository.class);
        currentPersonas = mock(CurrentTaskPersonaQueryPort.class);
        TaskPredictionApplicationPolicy policy =
                new TaskPredictionApplicationPolicy(
                        "candidate-policy-v1",
                        2,
                        new com.hamcheeze.vote.task.domain.prediction
                                .TaskPredictionRetryPolicy(
                                Duration.ofSeconds(60),
                                2,
                                Duration.ofSeconds(30)),
                        10);
        service = new TaskPredictionService(
                tasks,
                predictions,
                currentPersonas,
                policy,
                Clock.fixed(NOW.plusSeconds(20), ZoneOffset.UTC));
        when(tasks.findById(taskId())).thenReturn(Optional.of(openTask()));
        when(currentPersonas.findCurrentUsable(userId())).thenReturn(
                Optional.of(new CurrentTaskPersona(
                        personaGenerationId(), personaId())));
    }

    @Test
    void createsOnePendingPredictionForOpenTaskAndCurrentPersona() {
        when(predictions.findByIdentity(
                userId(), taskId(), personaGenerationId()))
                .thenReturn(Optional.empty());
        when(predictions.insert(any(TaskPrediction.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

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
    void resolvesUniqueConstraintRaceToTheConcurrentWinner() {
        TaskPrediction winner = TaskPrediction.pending(
                new TaskPredictionId(UUID.randomUUID()),
                userId(), taskId(), personaGenerationId(), personaId(),
                "candidate-policy-v1", 2, NOW.plusSeconds(20));
        when(predictions.findByIdentity(
                userId(), taskId(), personaGenerationId()))
                .thenReturn(Optional.empty(), Optional.of(winner));
        when(predictions.insert(any(TaskPrediction.class)))
                .thenThrow(new TaskPredictionPersistenceException(
                        TaskPredictionPersistenceException.ErrorCode
                                .IDENTITY_ALREADY_EXISTS,
                        "duplicate", null));

        EnsureTaskPredictionResult result =
                service.ensureTaskPrediction(userId(), taskId());

        assertThat(result.created()).isFalse();
        assertThat(result.prediction().id()).isEqualTo(winner.id());
    }

    @Test
    void returnsTerminalFailureAsDirectAnswerFallbackWithoutRerun() {
        TaskPrediction failed = failedPrediction();
        when(predictions.findByIdentity(
                userId(), taskId(), personaGenerationId()))
                .thenReturn(Optional.of(failed));

        EnsureTaskPredictionResult result =
                service.ensureTaskPrediction(userId(), taskId());

        assertThat(result.created()).isFalse();
        assertThat(result.directAnswerAllowed()).isTrue();
        assertThat(result.predictedAnswerAllowed()).isFalse();
        verify(predictions, never()).insert(any());
    }

    @Test
    void exposesOnlyPredictionForTheCurrentPersonaGeneration() {
        TaskPersonaGenerationId nextGeneration =
                new TaskPersonaGenerationId(UUID.randomUUID());
        CurrentTaskPersona nextPersona = new CurrentTaskPersona(
                nextGeneration, new TaskPersonaId("persona-next"));
        TaskPrediction currentPrediction = TaskPrediction.pending(
                new TaskPredictionId(UUID.randomUUID()),
                userId(), taskId(), nextGeneration, nextPersona.personaId(),
                "candidate-policy-v1", 2, NOW.plusSeconds(20));
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
        verify(predictions, never()).insert(any());
    }
}
