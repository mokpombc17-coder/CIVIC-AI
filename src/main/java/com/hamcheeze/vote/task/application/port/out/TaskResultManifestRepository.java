package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;

import java.util.Optional;

public interface TaskResultManifestRepository {

    TaskResultManifest insert(TaskResultManifest manifest);

    Optional<TaskResultManifest> findByTaskId(TaskId taskId);
}
