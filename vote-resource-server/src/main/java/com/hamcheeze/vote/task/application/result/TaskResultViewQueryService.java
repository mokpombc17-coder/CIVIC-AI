package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultResponseReader;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.Optional;

@Service
public class TaskResultViewQueryService {

    public static final int CURRENT_RESULT_VERSION = 1;

    private final TaskRepository tasks;
    private final TaskResultResponseReader responses;
    private final TaskResultViewV1Assembler assembler;

    public TaskResultViewQueryService(
            TaskRepository tasks,
            TaskResultResponseReader responses,
            TaskResultViewV1Assembler assembler
    ) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
        this.responses = Objects.requireNonNull(responses, "responses");
        this.assembler = Objects.requireNonNull(assembler, "assembler");
    }

    @Transactional(readOnly = true)
    public Optional<TaskResultViewV1> findByTaskId(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return tasks.findById(taskId)
                .map(task -> assembler.assemble(
                        task,
                        responses.findByTaskId(taskId),
                        CURRENT_RESULT_VERSION));
    }
}
