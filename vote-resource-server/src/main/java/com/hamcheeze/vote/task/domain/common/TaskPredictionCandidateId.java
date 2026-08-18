package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskPredictionCandidateId(UUID value) {
    public TaskPredictionCandidateId {
        value = TaskIdSupport.require(
                value,
                "TASK_PREDICTION_CANDIDATE_ID_REQUIRED",
                "candidateId");
    }
}
