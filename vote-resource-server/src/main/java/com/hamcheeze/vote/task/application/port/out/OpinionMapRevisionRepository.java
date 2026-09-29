package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationGatewayResult;
import com.hamcheeze.vote.task.domain.opinionmap.OpinionMapGeneration;

import java.time.Instant;
import java.util.UUID;

public interface OpinionMapRevisionRepository {

    void insertAiRevision(
            OpinionMapGeneration generation,
            UUID runId,
            String outputJson,
            OpinionMapGenerationGatewayResult result,
            Instant publishedAt);
}
