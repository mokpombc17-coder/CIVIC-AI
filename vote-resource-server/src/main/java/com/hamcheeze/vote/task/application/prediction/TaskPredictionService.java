package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionInputRepository;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionInputSnapshotFactory;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskAvailability;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.hamcheeze.vote.task.infra.prediction.TaskPredictionMetrics;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

@Service
public class TaskPredictionService {

    private final TaskRepository tasks;
    private final TaskPredictionRepository predictions;
    private final TaskPredictionInputRepository inputs;
    private final TaskPredictionInputSnapshotFactory inputSnapshots;
    private final CurrentTaskPersonaQueryPort currentPersonas;
    private final Supplier<TaskPredictionApplicationPolicy> policyProvider;
    private final TaskPredictionAvailability availability;
    private final Clock clock;
    private TaskPredictionMetrics metrics;

    @Autowired(required = false)
    void setMetrics(TaskPredictionMetrics metrics) {
        this.metrics = metrics;
    }

    @Autowired
    public TaskPredictionService(
            TaskRepository tasks,
            TaskPredictionRepository predictions,
            TaskPredictionInputRepository inputs,
            TaskPredictionInputSnapshotFactory inputSnapshots,
            CurrentTaskPersonaQueryPort currentPersonas,
            ObjectProvider<TaskPredictionApplicationPolicy> policyProvider,
            TaskPredictionAvailability availability
    ) {
        this(tasks, predictions, inputs, inputSnapshots,
                currentPersonas, policyProvider::getIfAvailable, availability,
                Clock.systemUTC());
    }

    TaskPredictionService(
            TaskRepository tasks,
            TaskPredictionRepository predictions,
            TaskPredictionInputRepository inputs,
            TaskPredictionInputSnapshotFactory inputSnapshots,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionApplicationPolicy policy,
            TaskPredictionAvailability availability
    ) {
        this(tasks, predictions, inputs, inputSnapshots,
                currentPersonas, policy, availability, Clock.systemUTC());
    }

    TaskPredictionService(
            TaskRepository tasks,
            TaskPredictionRepository predictions,
            TaskPredictionInputRepository inputs,
            TaskPredictionInputSnapshotFactory inputSnapshots,
            CurrentTaskPersonaQueryPort currentPersonas,
            TaskPredictionApplicationPolicy policy,
            TaskPredictionAvailability availability,
            Clock clock
    ) {
        this(tasks, predictions, inputs, inputSnapshots, currentPersonas,
                () -> policy, availability, clock);
    }

    private TaskPredictionService(
            TaskRepository tasks,
            TaskPredictionRepository predictions,
            TaskPredictionInputRepository inputs,
            TaskPredictionInputSnapshotFactory inputSnapshots,
            CurrentTaskPersonaQueryPort currentPersonas,
            Supplier<TaskPredictionApplicationPolicy> policyProvider,
            TaskPredictionAvailability availability,
            Clock clock
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.predictions = Objects.requireNonNull(
                predictions, "predictions");
        this.inputs = Objects.requireNonNull(inputs, "inputs");
        this.inputSnapshots = Objects.requireNonNull(
                inputSnapshots, "inputSnapshots");
        this.currentPersonas = Objects.requireNonNull(
                currentPersonas, "currentPersonas");
        this.policyProvider = Objects.requireNonNull(
                policyProvider, "policyProvider");
        this.availability = Objects.requireNonNull(
                availability, "availability");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public EnsureTaskPredictionResult ensureTaskPrediction(
            TaskUserId userId,
            TaskId taskId
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(taskId, "taskId");
        if (!availability.enabled()) {
            if (metrics != null) {
                metrics.disabledRejected();
            }
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_DISABLED",
                    "vote.task.prediction.enabled",
                    "task prediction feature is disabled");
        }
        Instant now = clock.instant();
        TaskPredictionApplicationPolicy policy = requirePolicy();
        Task task = requireOpenTask(taskId, now);
        CurrentTaskPersona persona = requireCurrentPersona(userId);

        Optional<TaskPrediction> existing = predictions.findByIdentity(
                userId, task.id(), persona.generationId());
        if (existing.isPresent()) {
            TaskPrediction value = existing.orElseThrow();
            requireInput(value);
            return EnsureTaskPredictionResult.of(value, false);
        }

        TaskPrediction pending = TaskPrediction.pending(
                new TaskPredictionId(UUID.randomUUID()),
                userId,
                task.id(),
                persona.generationId(),
                persona.personaId(),
                policy.candidatePolicyVersion(),
                now);
        TaskPredictionInputSnapshot input = inputSnapshots.create(
                pending, task, now);
        if (predictions.insertPendingIfAbsent(pending)) {
            inputs.insert(input);
            return EnsureTaskPredictionResult.of(pending, true);
        }
        TaskPrediction concurrentWinner = predictions.findByIdentity(
                        userId, task.id(), persona.generationId())
                .orElseThrow(() -> new IllegalStateException(
                        "conflicting TaskPrediction was not visible after "
                                + "ON CONFLICT DO NOTHING"));
        requireInput(concurrentWinner);
        return EnsureTaskPredictionResult.of(concurrentWinner, false);
    }

    private TaskPredictionApplicationPolicy requirePolicy() {
        TaskPredictionApplicationPolicy policy = policyProvider.get();
        if (policy == null) {
            throw new IllegalStateException(
                    "vote.task.prediction.enabled=true requires "
                            + "TaskPredictionApplicationPolicy");
        }
        return policy;
    }

    private void requireInput(TaskPrediction prediction) {
        TaskPredictionInputSnapshot input = inputs
                .findByPredictionId(prediction.id())
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_PREDICTION_INPUT_INVARIANT_VIOLATION",
                        "predictionId",
                        "prediction exists without its immutable input snapshot"));
        if (!input.predictionId().equals(prediction.id())
                || !input.taskId().equals(prediction.taskId())
                || !input.userId().equals(prediction.userId())
                || !input.personaGenerationId().equals(
                        prediction.personaGenerationId())
                || !input.providerPersonaId().equals(prediction.personaId())) {
            throw TaskDomainException.invariant(
                    "TASK_PREDICTION_INPUT_INVARIANT_VIOLATION",
                    "predictionId",
                    "prediction input metadata does not match prediction");
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
