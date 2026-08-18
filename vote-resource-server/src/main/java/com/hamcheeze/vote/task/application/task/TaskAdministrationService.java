package com.hamcheeze.vote.task.application.task;

import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleTrigger;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class TaskAdministrationService {

    private final TaskRepository tasks;
    private final Clock clock;

    @Autowired
    public TaskAdministrationService(TaskRepository tasks) {
        this(tasks, Clock.systemUTC());
    }

    TaskAdministrationService(TaskRepository tasks, Clock clock) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public Task createDraft(
            CreateDraftCommand command,
            TaskActorId actorId
    ) {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(actorId, "actorId");
        return tasks.save(Task.draft(
                new TaskId(UUID.randomUUID()),
                command.title(),
                command.description(),
                command.questions(),
                clock.instant()));
    }

    @Transactional
    public Task replaceDraft(
            TaskId taskId,
            ReplaceDraftCommand command,
            TaskActorId actorId
    ) {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(actorId, "actorId");
        Task task = lockTask(taskId);
        task.replaceContent(
                command.title(),
                command.description(),
                command.questions(),
                clock.instant());
        return tasks.save(task);
    }

    @Transactional(readOnly = true)
    public List<Task> findAll() {
        return tasks.findAll().stream()
                .sorted(Comparator.comparing(Task::createdAt).reversed())
                .toList();
    }

    @Transactional(readOnly = true)
    public Optional<Task> findById(TaskId taskId) {
        return tasks.findById(Objects.requireNonNull(taskId, "taskId"));
    }

    @Transactional
    public TaskLifecycleChange schedule(
            TaskId taskId,
            TaskSchedule schedule,
            String reason,
            TaskActorId actorId
    ) {
        Task task = lockTask(taskId);
        TaskLifecycleHistory history = task.schedule(
                nextHistoryId(),
                schedule,
                actorId,
                reason,
                clock.instant());
        return save(task, history);
    }

    @Transactional
    public TaskLifecycleChange openImmediately(
            TaskId taskId,
            Instant scheduledCloseAt,
            String reason,
            TaskActorId actorId
    ) {
        Task task = lockTask(taskId);
        TaskLifecycleHistory history = task.openImmediately(
                nextHistoryId(),
                scheduledCloseAt,
                actorId,
                reason,
                clock.instant());
        return save(task, history);
    }

    @Transactional
    public TaskLifecycleChange reschedule(
            TaskId taskId,
            TaskSchedule schedule,
            String reason,
            TaskActorId actorId
    ) {
        Task task = lockTask(taskId);
        TaskLifecycleHistory history = task.reschedule(
                nextHistoryId(),
                schedule,
                actorId,
                reason,
                clock.instant());
        return save(task, history);
    }

    @Transactional
    public TaskLifecycleChange openScheduledNow(
            TaskId taskId,
            String reason,
            TaskActorId actorId
    ) {
        Task task = lockTask(taskId);
        TaskLifecycleHistory history = task.openScheduled(
                nextHistoryId(),
                TaskLifecycleTrigger.ADMIN,
                actorId,
                reason,
                clock.instant());
        return save(task, history);
    }

    @Transactional
    public TaskLifecycleChange changeDeadline(
            TaskId taskId,
            Instant newCloseAt,
            String reason,
            TaskActorId actorId
    ) {
        Task task = lockTask(taskId);
        TaskLifecycleHistory history = task.changeDeadline(
                nextHistoryId(),
                newCloseAt,
                actorId,
                reason,
                clock.instant());
        return save(task, history);
    }

    @Transactional
    public TaskLifecycleChange closeEarly(
            TaskId taskId,
            String reason,
            TaskActorId actorId
    ) {
        Task task = lockTask(taskId);
        TaskLifecycleHistory history = task.closeEarly(
                nextHistoryId(),
                actorId,
                reason,
                clock.instant());
        return save(task, history);
    }

    @Transactional
    public TaskLifecycleChange cancel(
            TaskId taskId,
            String reason,
            TaskActorId actorId
    ) {
        Task task = lockTask(taskId);
        TaskLifecycleHistory history = task.cancel(
                nextHistoryId(),
                actorId,
                reason,
                clock.instant());
        return save(task, history);
    }

    @Transactional(readOnly = true)
    public Optional<TaskClosureFact> findClosureFact(TaskId taskId) {
        return tasks.findById(Objects.requireNonNull(taskId, "taskId"))
                .filter(task -> task.status() == TaskStatus.CLOSED)
                .map(task -> new TaskClosureFact(
                        task.id(),
                        task.closureType(),
                        task.closedAt(),
                        task.resultEligible()));
    }

    @Transactional
    public Optional<TaskLifecycleChange> transitionNextDue() {
        Instant now = clock.instant();
        return tasks.findNextLifecycleCandidateForUpdate(now)
                .map(task -> transitionDue(task, now));
    }

    private TaskLifecycleChange transitionDue(Task task, Instant now) {
        TaskLifecycleHistory history = switch (task.status()) {
            case SCHEDULED -> !now.isBefore(
                    task.schedule().scheduledCloseAt())
                    ? task.missSchedule(nextHistoryId(), now)
                    : task.openScheduled(
                            nextHistoryId(),
                            TaskLifecycleTrigger.SYSTEM,
                            null,
                            null,
                            now);
            case OPEN -> task.closeAtDeadline(nextHistoryId(), now);
            default -> throw TaskDomainException.invariant(
                    "TASK_LIFECYCLE_CANDIDATE_INVALID",
                    "status",
                    "repository returned a task without a due transition");
        };
        return save(task, history);
    }

    private Task lockTask(TaskId taskId) {
        return tasks.findByIdForUpdate(Objects.requireNonNull(
                        taskId, "taskId"))
                .orElseThrow(() -> TaskDomainException.invariant(
                        "TASK_NOT_FOUND",
                        "taskId",
                        "task does not exist"));
    }

    private TaskLifecycleChange save(
            Task task,
            TaskLifecycleHistory history
    ) {
        Task saved = tasks.save(task);
        tasks.appendLifecycleHistory(List.of(history));
        return new TaskLifecycleChange(saved, history);
    }

    private static TaskLifecycleHistoryId nextHistoryId() {
        return new TaskLifecycleHistoryId(UUID.randomUUID());
    }

    public record CreateDraftCommand(
            String title,
            String description,
            List<TaskQuestion> questions
    ) {
        public CreateDraftCommand {
            questions = List.copyOf(Objects.requireNonNull(
                    questions, "questions"));
        }
    }

    public record ReplaceDraftCommand(
            String title,
            String description,
            List<TaskQuestion> questions
    ) {
        public ReplaceDraftCommand {
            questions = List.copyOf(Objects.requireNonNull(
                    questions, "questions"));
        }
    }
}
