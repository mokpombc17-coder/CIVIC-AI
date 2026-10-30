package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationPayloadFactory;
import com.hamcheeze.vote.task.application.port.out.TaskPreparationRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationPolicy;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationRecord;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStatus;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class AdminTaskQueryService {

    private final TaskRepository tasks;
    private final TaskPreparationRepository preparations;
    private final TaskPreparationPayloadFactory preparationPayloads;
    private final TaskPreparationPolicy preparationPolicy;
    private final Clock clock;

    @Autowired
    public AdminTaskQueryService(
            TaskRepository tasks,
            TaskPreparationRepository preparations,
            TaskPreparationPayloadFactory preparationPayloads,
            TaskPreparationPolicy preparationPolicy
    ) {
        this(tasks, preparations, preparationPayloads,
                preparationPolicy, Clock.systemUTC());
    }

    AdminTaskQueryService(
            TaskRepository tasks,
            TaskPreparationRepository preparations,
            TaskPreparationPayloadFactory preparationPayloads,
            TaskPreparationPolicy preparationPolicy,
            Clock clock
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.preparations = Objects.requireNonNull(
                preparations, "preparations");
        this.preparationPayloads = Objects.requireNonNull(
                preparationPayloads, "preparationPayloads");
        this.preparationPolicy = Objects.requireNonNull(
                preparationPolicy, "preparationPolicy");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional(readOnly = true)
    public List<AdminTaskSummary> findAll() {
        return tasks.findAll().stream()
                .map(AdminTaskSummary::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public Optional<AdminTaskDetail> findById(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return tasks.findById(taskId).map(task -> {
            TaskPreparationRecord preparation = currentPreparation(task)
                    .orElse(null);
            return new AdminTaskDetail(
                    task,
                    preparation,
                    AdminTaskCapabilities.from(
                            task,
                            preparation,
                            clock.instant(),
                            preparationPolicy),
                    tasks.findLifecycleHistory(task.id()));
        });
    }

    private Optional<TaskPreparationRecord> currentPreparation(Task task) {
        String fingerprint = preparationPayloads.fingerprint(task);
        return preparations.findByTaskId(task.id())
                .filter(preparation -> preparation.contentFingerprint()
                        .equals(fingerprint));
    }

    public record AdminTaskSummary(
            TaskId taskId,
            String title,
            TaskStatus status,
            TaskSchedule schedule,
            Instant publishedAt,
            Instant openedAt,
            Instant closedAt,
            TaskClosureType closureType,
            Instant createdAt,
            Instant updatedAt
    ) {
        public AdminTaskSummary {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(createdAt, "createdAt");
            Objects.requireNonNull(updatedAt, "updatedAt");
        }

        static AdminTaskSummary from(Task task) {
            return new AdminTaskSummary(
                    task.id(), task.title(), task.status(), task.schedule(),
                    task.publishedAt(), task.openedAt(), task.closedAt(),
                    task.closureType(), task.createdAt(), task.updatedAt());
        }
    }

    public record AdminTaskDetail(
            Task task,
            TaskPreparationRecord preparation,
            AdminTaskCapabilities capabilities,
            List<TaskLifecycleHistory> lifecycleHistory
    ) {
        public AdminTaskDetail {
            Objects.requireNonNull(task, "task");
            Objects.requireNonNull(capabilities, "capabilities");
            lifecycleHistory = List.copyOf(Objects.requireNonNull(
                    lifecycleHistory, "lifecycleHistory"));
        }
    }

    public record AdminTaskCapabilities(
            boolean canEditContent,
            boolean canStartPreparation,
            boolean canSchedule,
            boolean canOpenNow
    ) {
        static AdminTaskCapabilities from(
                Task task,
                TaskPreparationRecord preparation,
                Instant now,
                TaskPreparationPolicy preparationPolicy
        ) {
            boolean draft = task.status() == TaskStatus.DRAFT;
            TaskPreparationStatus status = preparation == null
                    ? null : preparation.status();
            boolean contentLocked = status == TaskPreparationStatus.PROCESSING
                    || status == TaskPreparationStatus.READY;
            boolean ready = status == TaskPreparationStatus.READY;
            boolean canStart = preparation == null
                    || status == TaskPreparationStatus.FAILED
                    || status == TaskPreparationStatus.PROCESSING
                    && preparation.processingLeaseExpired(
                            now,
                            preparationPolicy.processingLeaseDuration());
            return new AdminTaskCapabilities(
                    draft && !contentLocked,
                    draft && canStart,
                    draft && ready,
                    draft && ready);
        }
    }
}
