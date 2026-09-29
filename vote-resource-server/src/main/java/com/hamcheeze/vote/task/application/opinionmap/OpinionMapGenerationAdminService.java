package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationManualRequestRepository;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.application.result.TaskResultManifestFinalizer;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationStatus;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.task.Task;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

@Service
public class OpinionMapGenerationAdminService {

    private final TaskRepository tasks;
    private final TaskResultManifestRepository manifests;
    private final TaskResultManifestFinalizer finalizer;
    private final OpinionMapGenerationStateService state;
    private final OpinionMapGenerationRepository generations;
    private final OpinionMapGenerationManualRequestRepository manualRequests;
    private final OpinionMapGenerationPolicy policy;
    private final OpinionMapRegenerationStateService regenerations;
    private final Clock clock;
    private final Supplier<UUID> requestIds;

    @Autowired
    public OpinionMapGenerationAdminService(
            TaskRepository tasks,
            TaskResultManifestRepository manifests,
            TaskResultManifestFinalizer finalizer,
            OpinionMapGenerationStateService state,
            OpinionMapGenerationRepository generations,
            OpinionMapGenerationManualRequestRepository manualRequests,
            OpinionMapGenerationPolicy policy,
            OpinionMapRegenerationStateService regenerations
    ) {
        this(tasks, manifests, finalizer, state, generations,
                manualRequests, policy, regenerations,
                Clock.systemUTC(), UUID::randomUUID);
    }

    OpinionMapGenerationAdminService(
            TaskRepository tasks,
            TaskResultManifestRepository manifests,
            TaskResultManifestFinalizer finalizer,
            OpinionMapGenerationStateService state,
            OpinionMapGenerationRepository generations,
            OpinionMapGenerationManualRequestRepository manualRequests,
            OpinionMapGenerationPolicy policy,
            OpinionMapRegenerationStateService regenerations,
            Clock clock,
            Supplier<UUID> requestIds
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.manifests = Objects.requireNonNull(manifests, "manifests");
        this.finalizer = Objects.requireNonNull(finalizer, "finalizer");
        this.state = Objects.requireNonNull(state, "state");
        this.generations = Objects.requireNonNull(generations, "generations");
        this.manualRequests = Objects.requireNonNull(
                manualRequests, "manualRequests");
        this.policy = Objects.requireNonNull(policy, "policy");
        this.regenerations = Objects.requireNonNull(
                regenerations, "regenerations");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.requestIds = Objects.requireNonNull(requestIds, "requestIds");
    }

    @Transactional
    public RegenerationExecution regenerate(
            TaskId taskId,
            String requestedBy
    ) {
        return regenerate(taskId, requestedBy, null);
    }

    @Transactional
    public RegenerationExecution regenerate(
            TaskId taskId,
            String requestedBy,
            String idempotencyKey
    ) {
        Objects.requireNonNull(taskId, "taskId");
        String actor = requireActor(requestedBy);
        String normalizedIdempotencyKey = normalizeIdempotencyKey(
                idempotencyKey);
        requireEnabled();

        Task task = tasks.findByIdForUpdate(taskId)
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_NOT_FOUND",
                        "taskId",
                        "the task does not exist"));
        if (!task.resultEligible()) {
            throw TaskDomainException.invariant(
                    "TASK_RESULT_NOT_ELIGIBLE",
                    "task.status",
                    "only a result-eligible closed task can regenerate an Opinion Map");
        }
        TaskResultManifest manifest = manifests.findByTaskId(taskId)
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_RESULT_NOT_FINALIZED",
                        "task.result",
                        "the task result has not been finalized"));
        OpinionMapGeneration generation = generations
                .findByTaskResultForUpdate(
                        taskId, manifest.resultVersion())
                .orElseThrow(() -> TaskDomainException.invariant(
                        "OPINION_MAP_NOT_CREATED",
                        "opinionMapGeneration",
                        "the Opinion Map has not been created"));
        if (generation.status() != OpinionMapGenerationStatus.AVAILABLE) {
            throw TaskDomainException.invariant(
                    "OPINION_MAP_NOT_AVAILABLE",
                    "opinionMapGeneration.status",
                    "only an available Opinion Map can be regenerated");
        }
        OpinionMapRegenerationStateService.Request request =
                regenerations.enqueue(
                        generation, actor, normalizedIdempotencyKey);
        return new RegenerationExecution(
                generation.taskId(),
                generation.resultVersion(),
                request.run(),
                request.created());
    }

    @Transactional
    public Execution request(TaskId taskId, String requestedBy) {
        Objects.requireNonNull(taskId, "taskId");
        String actor = requireActor(requestedBy);
        requireEnabled();

        Task task = tasks.findByIdForUpdate(taskId)
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_NOT_FOUND",
                        "taskId",
                        "the task does not exist"));
        if (!task.resultEligible()) {
            throw TaskDomainException.invariant(
                    "TASK_RESULT_NOT_ELIGIBLE",
                    "task.status",
                    "only a result-eligible closed task can generate an Opinion Map");
        }

        Optional<TaskResultManifest> existingManifest =
                manifests.findByTaskId(taskId);
        boolean manifestCreated = existingManifest.isEmpty();
        TaskResultManifest manifest = existingManifest.orElseGet(
                () -> finalizer.finalizeResult(task));

        OpinionMapGeneration generation = generations
                .findByTaskResultForUpdate(taskId, manifest.resultVersion())
                .orElse(null);
        boolean generationCreated = manifestCreated;
        if (generation == null) {
            generationCreated = state.enqueue(manifest);
            generation = generations.findByTaskResultForUpdate(
                            taskId, manifest.resultVersion())
                    .orElseThrow(() -> new IllegalStateException(
                            "Opinion Map generation was not enqueued"));
        }

        if (generationCreated) {
            recordManualRequest(generation, actor,
                    OpinionMapGenerationManualRequest.Action.CREATED,
                    0, null);
            return new Execution(generation, Action.CREATED);
        }
        if (generation.status() == OpinionMapGenerationStatus.UNAVAILABLE) {
            int previousAttemptCount = generation.attemptCount();
            String previousErrorCode = generation.lastErrorCode();
            Instant requestedAt = clock.instant();
            generation.scheduleManualRetry(requestedAt);
            generation = generations.save(generation);
            state.enqueueManualRetryRun(generation, actor, requestedAt);
            recordManualRequest(
                    generation,
                    actor,
                    OpinionMapGenerationManualRequest.Action.RETRIED,
                    previousAttemptCount,
                    previousErrorCode,
                    requestedAt);
            return new Execution(generation, Action.RETRIED);
        }
        return new Execution(generation, Action.UNCHANGED);
    }

    private void requireEnabled() {
        if (!policy.enabled()) {
            throw TaskDomainException.invariant(
                    "OPINION_MAP_GENERATION_DISABLED",
                    "opinionMapGeneration",
                    "Opinion Map generation is disabled");
        }
    }

    private void recordManualRequest(
            OpinionMapGeneration generation,
            String requestedBy,
            OpinionMapGenerationManualRequest.Action action,
            int previousAttemptCount,
            String previousErrorCode
    ) {
        recordManualRequest(generation, requestedBy, action,
                previousAttemptCount, previousErrorCode, clock.instant());
    }

    private void recordManualRequest(
            OpinionMapGeneration generation,
            String requestedBy,
            OpinionMapGenerationManualRequest.Action action,
            int previousAttemptCount,
            String previousErrorCode,
            Instant requestedAt
    ) {
        manualRequests.insert(new OpinionMapGenerationManualRequest(
                requestIds.get(), generation.id(), action,
                previousAttemptCount, previousErrorCode,
                requestedBy, requestedAt));
    }

    private static String requireActor(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("requestedBy must not be blank");
        }
        String normalized = value.trim();
        if (normalized.length() > 255) {
            throw new IllegalArgumentException("requestedBy is too long");
        }
        return normalized;
    }

    private static String normalizeIdempotencyKey(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() > 100) {
            throw new IllegalArgumentException(
                    "idempotencyKey is too long");
        }
        return normalized;
    }

    public record Execution(
            OpinionMapGeneration generation,
            Action action
    ) {
        public Execution {
            Objects.requireNonNull(generation, "generation");
            Objects.requireNonNull(action, "action");
        }

        public boolean changed() {
            return action != Action.UNCHANGED;
        }
    }

    public enum Action {
        CREATED,
        RETRIED,
        UNCHANGED
    }

    public record RegenerationExecution(
            TaskId taskId,
            int resultVersion,
            OpinionMapGenerationRun run,
            boolean created
    ) {
        public RegenerationExecution {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(run, "run");
        }
    }
}
