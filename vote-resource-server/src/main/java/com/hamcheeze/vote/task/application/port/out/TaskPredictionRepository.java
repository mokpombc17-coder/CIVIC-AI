package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface TaskPredictionRepository {

    TaskPrediction insert(TaskPrediction prediction);

    TaskPrediction save(TaskPrediction prediction);

    Optional<TaskPrediction> findById(TaskPredictionId predictionId);

    Optional<TaskPrediction> findByIdForUpdate(TaskPredictionId predictionId);

    Optional<TaskPrediction> findByIdentity(
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId);

    Optional<TaskPrediction> findByIdentityForUpdate(
            TaskUserId userId,
            TaskId taskId,
            TaskPersonaGenerationId personaGenerationId);

    Optional<TaskPrediction> findNextDispatchableForUpdate(Instant dueAt);

    TaskPredictionAttempt saveAttempt(TaskPredictionAttempt attempt);

    List<TaskPredictionAttempt> findAttempts(TaskPredictionId predictionId);
}
