package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.prediction.TaskPredictionInputSnapshot;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.pendingPrediction;
import static org.assertj.core.api.Assertions.assertThat;

class TaskPredictionInputSnapshotFactoryAdapterTest {

    private final TaskPredictionInputSnapshotFactoryAdapter factory =
            new TaskPredictionInputSnapshotFactoryAdapter(new ObjectMapper());

    @Test
    void createsDeterministicExactProviderPayloadAndFingerprint() {
        Task task = openTask();
        TaskPrediction prediction = pendingPrediction();

        TaskPredictionInputSnapshot first = factory.create(
                prediction, task, NOW.plusSeconds(20));
        TaskPredictionInputSnapshot second = factory.create(
                prediction, task, NOW.plusSeconds(20));

        assertThat(first.requestPayload())
                .isEqualTo(second.requestPayload())
                .contains(prediction.id().value().toString())
                .contains(prediction.personaId().value())
                .contains(task.id().value().toString());
        assertThat(first.requestFingerprint())
                .isEqualTo(second.requestFingerprint())
                .isEqualTo(TaskPredictionInputSnapshot.fingerprint(
                        first.requestPayload()));
        assertThat(first.requestSchemaVersion())
                .isEqualTo(TaskPredictionHttpModels.SCHEMA_VERSION);
        assertThat(first.taskEndsAt())
                .isEqualTo(task.schedule().scheduledCloseAt());
    }
}
