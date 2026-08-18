package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;

import java.util.List;
import java.util.Optional;
import java.time.Instant;

public interface TaskRepository {

    Task save(Task task);

    Optional<Task> findById(TaskId taskId);

    Optional<Task> findByIdForUpdate(TaskId taskId);

    List<Task> findAll();

    Optional<Task> findNextLifecycleCandidateForUpdate(Instant dueAt);

    void appendLifecycleHistory(List<TaskLifecycleHistory> histories);

    List<TaskLifecycleHistory> findLifecycleHistory(TaskId taskId);
}
