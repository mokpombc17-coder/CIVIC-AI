package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskAvailability;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class TaskPredictionService {

    private final TaskRepository tasks;
    private final TaskPredictionRepository predictions;
    private final CurrentTaskPersonaQueryPort currentPersonas;
    private final TaskPredictionApplicationPolicy policy;
    private final Clock clock;

    @Autowired
    public TaskPredictionService(
            TaskRepository tasks,
            TaskPredictionRepository predictions,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionApplicationPolicy policy
    ) {
        this(tasks, predictions, currentPersonas, policy,
                Clock.systemUTC());
    }

    TaskPredictionService(
            TaskRepository tasks,
            TaskPredictionRepository predictions,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionApplicationPolicy policy,
            Clock clock
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.predictions = Objects.requireNonNull(
                predictions, "predictions");
        this.currentPersonas = Objects.requireNonNull(
                currentPersonas, "currentPersonas");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public EnsureTaskPredictionResult ensureTaskPrediction(
            TaskUserId userId,
            TaskId taskId
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(taskId, "taskId");
        Instant now = clock.instant();
        Task task = requireOpenTask(taskId, now);
        CurrentTaskPersona persona = requireCurrentPersona(userId);

        Optional<TaskPrediction> existing = predictions.findByIdentity(
                userId, task.id(), persona.generationId());
        if (existing.isPresent()) {
            return EnsureTaskPredictionResult.of(existing.get(), false);
        }

        TaskPrediction pending = TaskPrediction.pending(
                new TaskPredictionId(UUID.randomUUID()),
                userId,
                task.id(),
                persona.generationId(),
                persona.versionId(),
                persona.personaId(),
                policy.candidatePolicyVersion(),
                now);
        try {
            return EnsureTaskPredictionResult.of(
                    predictions.insert(pending), true);
        } catch (TaskPredictionPersistenceException exception) {
            if (exception.code()
                    != TaskPredictionPersistenceException.ErrorCode
                    .IDENTITY_ALREADY_EXISTS) {
                throw exception;
            }
            TaskPrediction concurrentWinner = predictions.findByIdentity(
                            userId, task.id(), persona.generationId())
                    .orElseThrow(() -> exception);
            return EnsureTaskPredictionResult.of(
                    concurrentWinner, false);
        }
    }

    public Optional<TaskPrediction> findCurrentPrediction(
            TaskUserId userId,
            TaskId taskId
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(taskId, "taskId");
        return currentPersonas.findCurrentUsable(userId)
                .flatMap(persona -> predictions.findByIdentity(
                        userId, taskId, persona.generationId()));
    }

    private Task requireOpenTask(TaskId taskId, Instant now) {
        Task task = tasks.findById(taskId)
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_NOT_FOUND",
                        "taskId",
                        "task was not found"));
        TaskAvailability availability = task.availabilityAt(now);
        if (availability != TaskAvailability.OPEN) {
            String code = availability == TaskAvailability.CLOSED
                    ? "TASK_CLOSED" : "TASK_UNPUBLISHED";
            throw TaskDomainException.invariant(
                    code,
                    "taskId",
                    "prediction is available only for an open task");
        }
        return task;
    }

    private CurrentTaskPersona requireCurrentPersona(TaskUserId userId) {
        return currentPersonas.findCurrentUsable(userId)
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_CURRENT_PERSONA_NOT_READY",
                        "userId",
                        "a current usable persona is required"));
    }
}
