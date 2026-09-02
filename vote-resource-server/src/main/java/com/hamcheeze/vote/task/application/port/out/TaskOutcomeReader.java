package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.query.TaskOutcomeCursor;
import com.hamcheeze.vote.task.application.query.TaskOutcomeView;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;

import java.util.List;
import java.util.Optional;

public interface TaskOutcomeReader {

    List<TaskOutcomeView> findByTask(
            TaskId taskId,
            Optional<TaskOutcomeCursor> cursor,
            int limit);

    Optional<TaskOutcomeView> findByTaskAndPersona(
            TaskId taskId,
            TaskPersonaId personaId);
}
