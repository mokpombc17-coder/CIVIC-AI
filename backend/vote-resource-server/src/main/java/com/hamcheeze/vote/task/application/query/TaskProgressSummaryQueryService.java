package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskProgressSummaryReader;
import com.hamcheeze.vote.task.application.port.out.TaskProgressSummaryReader.OptionSubmissionCount;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Service
public class TaskProgressSummaryQueryService {

    private final TaskRepository tasks;
    private final TaskProgressSummaryReader progress;
    private final Clock clock;

    @Autowired
    public TaskProgressSummaryQueryService(
            TaskRepository tasks,
            TaskProgressSummaryReader progress
    ) {
        this(tasks, progress, Clock.systemUTC());
    }

    TaskProgressSummaryQueryService(
            TaskRepository tasks,
            TaskProgressSummaryReader progress,
            Clock clock
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.progress = Objects.requireNonNull(progress, "progress");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional(readOnly = true)
    public Optional<TaskProgressSummary> findByTaskId(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        Optional<Task> found = tasks.findById(taskId);
        if (found.isEmpty()) {
            return Optional.empty();
        }

        Task task = found.orElseThrow();
        if (task.status() != TaskStatus.OPEN) {
            throw TaskDomainException.invariant(
                    "TASK_PROGRESS_SUMMARY_NOT_AVAILABLE",
                    "task.status",
                    "progress summary is available only while task is open");
        }

        Map<TaskOptionId, Long> counts = countsByOption(
                progress.countSelections(taskId));
        List<TaskOption> taskOptions = task.questions().getFirst().options();
        long submissionCount = taskOptions.stream()
                .mapToLong(option -> counts.getOrDefault(option.id(), 0L))
                .sum();
        long countedRows = counts.values().stream()
                .mapToLong(Long::longValue)
                .sum();
        if (submissionCount != countedRows) {
            throw new IllegalStateException(
                    "submission count references an unknown task option");
        }
        List<OptionProgress> options = taskOptions.stream()
                .map(option -> toProgress(option, counts, submissionCount))
                .toList();
        return Optional.of(new TaskProgressSummary(
                task.id(), task.status(), clock.instant(), submissionCount,
                options));
    }

    private static Map<TaskOptionId, Long> countsByOption(
            List<OptionSubmissionCount> rows
    ) {
        Objects.requireNonNull(rows, "rows");
        Map<TaskOptionId, Long> counts = new HashMap<>();
        for (OptionSubmissionCount row : rows) {
            Objects.requireNonNull(row, "option submission count");
            Long duplicate = counts.put(row.optionId(), row.count());
            if (duplicate != null) {
                throw new IllegalStateException(
                        "duplicate option count: " + row.optionId());
            }
        }
        return Map.copyOf(counts);
    }

    private static OptionProgress toProgress(
            TaskOption option,
            Map<TaskOptionId, Long> counts,
            long submissionCount
    ) {
        long count = counts.getOrDefault(option.id(), 0L);
        double rate = submissionCount == 0
                ? 0.0
                : (double) count / submissionCount;
        return new OptionProgress(option.id(), option.content(), count, rate);
    }

    public record TaskProgressSummary(
            TaskId taskId,
            TaskStatus status,
            Instant observedAt,
            long submissionCount,
            List<OptionProgress> options
    ) {

        public TaskProgressSummary {
            Objects.requireNonNull(taskId, "taskId");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(observedAt, "observedAt");
            if (submissionCount < 0) {
                throw new IllegalArgumentException(
                        "submissionCount must not be negative");
            }
            options = List.copyOf(Objects.requireNonNull(options, "options"));
            if (options.isEmpty()) {
                throw new IllegalArgumentException("options must not be empty");
            }
        }
    }

    public record OptionProgress(
            TaskOptionId optionId,
            String content,
            long count,
            double rate
    ) {

        public OptionProgress {
            Objects.requireNonNull(optionId, "optionId");
            Objects.requireNonNull(content, "content");
            if (count < 0) {
                throw new IllegalArgumentException(
                        "count must not be negative");
            }
            if (!Double.isFinite(rate) || rate < 0.0 || rate > 1.0) {
                throw new IllegalArgumentException(
                        "rate must be between zero and one");
            }
        }
    }
}
