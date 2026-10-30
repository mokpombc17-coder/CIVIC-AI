package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRunHistory;
import com.hamcheeze.vote.task.domain.common.TaskId;

import java.util.List;

public interface OpinionMapGenerationRunHistoryRepository {

    List<OpinionMapGenerationRunHistory> findByTaskId(TaskId taskId);
}
