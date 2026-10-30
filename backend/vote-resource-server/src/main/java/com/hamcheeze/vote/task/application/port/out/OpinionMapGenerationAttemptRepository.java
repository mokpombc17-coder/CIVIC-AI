package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationAttempt;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationException;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationGatewayResult;

import java.time.Instant;
import java.util.UUID;

public interface OpinionMapGenerationAttemptRepository {

    void insert(OpinionMapGenerationAttempt attempt);

    void completeSuccess(
            UUID attemptId,
            OpinionMapGenerationGatewayResult result,
            Instant completedAt,
            long latencyMs);

    void completeFailure(
            UUID attemptId,
            OpinionMapGenerationException failure,
            Instant completedAt,
            long latencyMs);
}
