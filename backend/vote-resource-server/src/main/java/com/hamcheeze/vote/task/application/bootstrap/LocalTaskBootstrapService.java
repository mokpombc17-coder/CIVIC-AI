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
        boolean created = false;
        for (Task fixture : LocalTaskFixture.drafts()) {
            var existing = tasks.findById(fixture.id());
            if (existing.isPresent()) {
                validateCompleteFixture(existing.get());
                continue;
            }
            createFixture(fixture);
            created = true;
        }
        return created
                ? LocalTaskBootstrapResult.CREATED
                : LocalTaskBootstrapResult.ALREADY_PRESENT;
    }

    private void createFixture(Task fixture) {
        TaskLifecycleHistory opened = LocalTaskFixture.open(fixture);
        tasks.save(fixture);
        tasks.appendLifecycleHistory(List.of(opened));
    }

    private void validateCompleteFixture(Task task) {
        if (!LocalTaskFixture.matches(task)) {
            throw conflict("local Task fixture is partial or changed");
        }
        List<TaskLifecycleHistory> histories =
                tasks.findLifecycleHistory(task.id());
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
