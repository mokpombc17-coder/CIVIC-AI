package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.prediction.TaskPredictionInputSnapshot;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;

import java.util.Optional;

public interface TaskPredictionInputRepository {

    TaskPredictionInputSnapshot insert(TaskPredictionInputSnapshot snapshot);

    Optional<TaskPredictionInputSnapshot> findByPredictionId(
            TaskPredictionId predictionId);
}
