package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationRecord;
import com.hamcheeze.vote.task.domain.common.TaskId;

import java.util.Optional;

public interface TaskPreparationRepository {

    Optional<TaskPreparationRecord> findByTaskIdForUpdate(TaskId taskId);

    TaskPreparationRecord save(TaskPreparationRecord preparation);

}
