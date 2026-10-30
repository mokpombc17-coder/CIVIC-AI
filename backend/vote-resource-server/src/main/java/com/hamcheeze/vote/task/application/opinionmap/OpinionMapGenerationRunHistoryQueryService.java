package com.hamcheeze.vote.task.application.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationRunHistoryRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class OpinionMapGenerationRunHistoryQueryService {

    private final TaskRepository tasks;
    private final OpinionMapGenerationRunHistoryRepository histories;

    public OpinionMapGenerationRunHistoryQueryService(
            TaskRepository tasks,
            OpinionMapGenerationRunHistoryRepository histories
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.histories = Objects.requireNonNull(histories, "histories");
    }

    @Transactional(readOnly = true)
    public Optional<List<OpinionMapGenerationRunHistory>> findByTaskId(
            TaskId taskId
    ) {
        Objects.requireNonNull(taskId, "taskId");
        if (tasks.findById(taskId).isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(histories.findByTaskId(taskId));
    }
}
