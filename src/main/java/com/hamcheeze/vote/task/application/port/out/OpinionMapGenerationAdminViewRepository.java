package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapUnavailableCursor;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGenerationId;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface OpinionMapGenerationAdminViewRepository {

    List<UnavailableRow> findUnavailable(
            Optional<OpinionMapUnavailableCursor> cursor,
            int limit);

    record UnavailableRow(
            OpinionMapGenerationId generationId,
            TaskId taskId,
            String taskTitle,
            int resultVersion,
            int attemptCount,
            String lastErrorCode,
            Instant failedAt
    ) {
    }
}
