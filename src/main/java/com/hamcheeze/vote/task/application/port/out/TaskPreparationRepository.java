package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationRecord;
import com.hamcheeze.vote.task.domain.common.TaskId;

import java.util.Optional;
import java.util.UUID;

public interface TaskPreparationRepository {

    Optional<TaskPreparationRecord> findByTaskId(TaskId taskId);

    Optional<TaskPreparationRecord> findByRequestId(UUID requestId);

    Optional<TaskPreparationRecord> findByTaskIdForUpdate(TaskId taskId);

    TaskPreparationRecord save(TaskPreparationRecord preparation);

}
