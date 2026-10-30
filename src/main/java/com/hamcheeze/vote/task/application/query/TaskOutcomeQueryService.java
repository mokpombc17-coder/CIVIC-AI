package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.task.application.port.out.TaskOutcomeReader;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class TaskOutcomeQueryService {

    public static final int DEFAULT_LIMIT = 100;
    public static final int MAX_LIMIT = 100;

    private final TaskRepository tasks;
    private final TaskOutcomeReader outcomes;
    private final TaskOutcomeCursorCodec cursors;

    public TaskOutcomeQueryService(
            TaskRepository tasks,
            TaskOutcomeReader outcomes,
            TaskOutcomeCursorCodec cursors
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.outcomes = Objects.requireNonNull(outcomes, "outcomes");
        this.cursors = Objects.requireNonNull(cursors, "cursors");
    }

    public Optional<TaskOutcomePage> findByTask(
            TaskId taskId,
            String cursor,
            int limit
    ) {
        Objects.requireNonNull(taskId, "taskId");
        validateLimit(limit);
        if (tasks.findById(taskId).isEmpty()) {
            return Optional.empty();
        }
        Optional<TaskOutcomeCursor> decoded = cursor == null
                ? Optional.empty()
                : Optional.of(cursors.decode(cursor));
        decoded.ifPresent(value -> {
            if (!taskId.equals(value.taskId())) {
                throw new IllegalArgumentException(
                        "task outcome cursor does not match task");
            }
        });

        List<TaskOutcomeView> rows = outcomes.findByTask(
                taskId, decoded, limit + 1);
        boolean hasMore = rows.size() > limit;
        List<TaskOutcomeView> items = rows.stream().limit(limit).toList();
        String nextCursor = items.isEmpty()
                ? cursor
                : cursors.encode(cursor(items.getLast()));
        return Optional.of(new TaskOutcomePage(
                items, nextCursor, hasMore));
    }

    public Optional<TaskOutcomeView> findByTaskAndPersona(
            TaskId taskId,
            TaskPersonaId personaId
    ) {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(personaId, "personaId");
        return outcomes.findByTaskAndPersona(taskId, personaId);
    }

    private static void validateLimit(int limit) {
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException(
                    "task outcome limit must be between 1 and " + MAX_LIMIT);
        }
    }

    private static TaskOutcomeCursor cursor(TaskOutcomeView item) {
        return new TaskOutcomeCursor(
                item.taskId(), item.submittedAt(), item.outcomeId());
    }

    public record TaskOutcomePage(
            List<TaskOutcomeView> items,
            String nextCursor,
            boolean hasMore
    ) {
        public TaskOutcomePage {
            items = List.copyOf(Objects.requireNonNull(items, "items"));
        }
    }
}
