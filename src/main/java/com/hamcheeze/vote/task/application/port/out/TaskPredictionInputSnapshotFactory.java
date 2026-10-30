package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.prediction.TaskPredictionInputSnapshot;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.task.Task;

import java.time.Instant;

public interface TaskPredictionInputSnapshotFactory {

    TaskPredictionInputSnapshot create(
            TaskPrediction prediction,
            Task task,
            Instant createdAt);
}
