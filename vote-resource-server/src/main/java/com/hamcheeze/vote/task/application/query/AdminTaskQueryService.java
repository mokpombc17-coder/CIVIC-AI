package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class AdminTaskQueryService {

    private final TaskRepository tasks;

    public AdminTaskQueryService(TaskRepository tasks) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
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
        return tasks.findById(taskId)
                .map(task -> new AdminTaskDetail(
                        task,
                        tasks.findLifecycleHistory(task.id())));
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
            int questionCount,
            Instant createdAt,
            Instant updatedAt
    ) {
        public AdminTaskSummary {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(title, "title");
            Objects.requireNonNull(status, "status");
            if (questionCount < 0) {
                throw new IllegalArgumentException(
                        "questionCount must not be negative");
            }
            Objects.requireNonNull(createdAt, "createdAt");
            Objects.requireNonNull(updatedAt, "updatedAt");
        }

        static AdminTaskSummary from(Task task) {
            return new AdminTaskSummary(
                    task.id(), task.title(), task.status(), task.schedule(),
                    task.publishedAt(), task.openedAt(), task.closedAt(),
                    task.closureType(), task.questions().size(),
                    task.createdAt(), task.updatedAt());
        }
    }

    public record AdminTaskDetail(
            Task task,
            List<TaskLifecycleHistory> lifecycleHistory
    ) {
        public AdminTaskDetail {
            Objects.requireNonNull(task, "task");
            lifecycleHistory = List.copyOf(Objects.requireNonNull(
                    lifecycleHistory, "lifecycleHistory"));
        }
    }
}
