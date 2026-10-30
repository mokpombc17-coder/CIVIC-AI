package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;

import java.time.Instant;
import java.util.Optional;

public interface OpinionMapGenerationRepository {

    boolean insertIfAbsent(OpinionMapGeneration generation);

    OpinionMapGeneration save(OpinionMapGeneration generation);

    Optional<OpinionMapGeneration> findByIdForUpdate(
            OpinionMapGenerationId generationId);

    Optional<OpinionMapGeneration> findByTaskResult(
            TaskId taskId,
            int resultVersion);

    default Optional<OpinionMapGeneration> findByTaskResultForUpdate(
            TaskId taskId,
            int resultVersion
    ) {
        return findByTaskResult(taskId, resultVersion);
    }

    Optional<OpinionMapGeneration> findNextDispatchableForUpdate(
            Instant dueAt);
}
