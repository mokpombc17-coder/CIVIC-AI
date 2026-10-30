package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.result.TaskResultResponse;
import com.hamcheeze.vote.task.domain.common.TaskId;

import java.util.List;

public interface TaskResultResponseReader {

    List<TaskResultResponse> findByTaskId(TaskId taskId);
}
