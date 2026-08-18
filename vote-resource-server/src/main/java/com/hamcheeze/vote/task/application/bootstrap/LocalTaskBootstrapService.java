package com.hamcheeze.vote.task.application.bootstrap;

import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

@Service
@Profile("local")
public class LocalTaskBootstrapService {

    private final TaskRepository tasks;

    public LocalTaskBootstrapService(TaskRepository tasks) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
    }

    @Transactional
    public LocalTaskBootstrapResult initialize() {
        var existing = tasks.findById(LocalTaskFixture.TASK_ID);
        if (existing.isPresent()) {
            validateCompleteFixture(existing.get());
            return LocalTaskBootstrapResult.ALREADY_PRESENT;
        }

        Task task = LocalTaskFixture.draft();
        TaskLifecycleHistory opened = task.openImmediately(
                LocalTaskFixture.HISTORY_ID,
                LocalTaskFixture.CLOSE_AT,
                LocalTaskFixture.ACTOR,
                LocalTaskFixture.OPEN_REASON,
                LocalTaskFixture.CREATED_AT);
        tasks.save(task);
        tasks.appendLifecycleHistory(List.of(opened));
        return LocalTaskBootstrapResult.CREATED;
    }

    private void validateCompleteFixture(Task task) {
        if (!LocalTaskFixture.matches(task)) {
            throw conflict("local Task fixture is partial or changed");
        }
        List<TaskLifecycleHistory> histories =
                tasks.findLifecycleHistory(LocalTaskFixture.TASK_ID);
        if (histories.size() != 1
                || !LocalTaskFixture.matches(histories.getFirst())) {
            throw conflict(
                    "local Task lifecycle fixture is partial or changed");
        }
    }

    private static LocalTaskBootstrapException conflict(String detail) {
        return new LocalTaskBootstrapException(detail);
    }
}
