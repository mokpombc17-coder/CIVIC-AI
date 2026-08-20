package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.port.out.TaskPredictionInputSnapshotFactory;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionInputSnapshot;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionInputException;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.task.Task;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.Objects;

@Component
public class TaskPredictionInputSnapshotFactoryAdapter
        implements TaskPredictionInputSnapshotFactory {

    private final ObjectMapper objectMapper;

    public TaskPredictionInputSnapshotFactoryAdapter(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    public TaskPredictionInputSnapshot create(
            TaskPrediction prediction,
            Task task,
            Instant createdAt
    ) {
        Objects.requireNonNull(prediction, "prediction");
        Objects.requireNonNull(task, "task");
        try {
            String payload = objectMapper.writeValueAsString(
                    TaskPredictionHttpModels.PredictionRequest.from(
                            prediction.id(), prediction.personaId(),
                            prediction.candidatePolicyVersion(), task));
            return TaskPredictionInputSnapshot.create(
                    prediction.id(), task.id(), prediction.userId(),
                    prediction.personaGenerationId(),
                    prediction.personaVersionId(), prediction.personaId(),
                    task.schedule().scheduledCloseAt(),
                    TaskPredictionHttpModels.SCHEMA_VERSION,
                    prediction.candidatePolicyVersion(), payload, createdAt);
        } catch (RuntimeException exception) {
            throw new TaskPredictionInputException(
                    TaskPredictionInputException.ErrorCode.INTEGRITY_ERROR,
                    "Task prediction input could not be serialized",
                    exception);
        }
    }
}
