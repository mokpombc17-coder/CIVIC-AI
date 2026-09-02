package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.bootstrap.LocalTaskFixture;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationCommand;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionInputSnapshot;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationException;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationResult;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LocalTaskPredictionFakeCreationAdapterTest {

    private static final TaskPredictionId REQUEST_ID =
            new TaskPredictionId(UUID.fromString(
                    "13030000-0000-0000-0000-000000000001"));

    @Test
    void successIsDeterministicAndCoversEveryCandidateSlot() {
        LocalTaskPredictionProperties properties = properties(
                LocalTaskPredictionProperties.Scenario.SUCCESS);
        var adapter = new LocalTaskPredictionFakeCreationAdapter(properties);
        PredictionCreationCommand command = command();

        PredictionCreationResult first = adapter.create(command);
        PredictionCreationResult second = adapter.create(command);

        assertThat(second.requestId()).isEqualTo(first.requestId());
        assertThat(second.taskId()).isEqualTo(first.taskId());
        assertThat(second.predictedReasons()).isEqualTo(first.predictedReasons());
        assertThat(second.httpStatus()).isEqualTo(first.httpStatus());
        assertThat(second.responsePayload().value())
                .isEqualTo(first.responsePayload().value());
        assertThat(first.predictedReasons()).hasSize(6);
        assertThat(first.predictedReasons())
                .allSatisfy(candidate -> assertThat(
                        candidate.predictionId()).isEqualTo(REQUEST_ID));

        Task task = LocalTaskFixtureAccess.openTask();
        TaskPrediction prediction = TaskPrediction.pending(
                REQUEST_ID,
                new com.hamcheeze.vote.task.domain.common.TaskUserId(
                        "local-user"),
                task.id(),
                new com.hamcheeze.vote.task.domain.common
                        .TaskPersonaGenerationId(UUID.fromString(
                        "13030000-0000-0000-0000-000000000002")),
                new TaskPersonaId("local-persona"),
                "candidate-policy-v1",
                Instant.parse("2026-08-18T00:00:01Z"));
        prediction.startProcessing(
                new TaskPredictionRetryPolicy(
                        Duration.ofSeconds(60), 2, Duration.ofSeconds(1)),
                Instant.parse("2026-08-18T00:00:02Z"));
        prediction.succeed(
                task,
                first.predictedReasons(),
                Instant.parse("2026-08-18T00:00:03Z"));
        assertThat(prediction.predictedReasons()).hasSize(6);
    }

    @Test
    void finalFailureIsNonRetryable() {
        var adapter = new LocalTaskPredictionFakeCreationAdapter(properties(
                LocalTaskPredictionProperties.Scenario.FINAL_FAILURE));

        assertThatThrownBy(() -> adapter.create(command()))
                .isInstanceOfSatisfying(
                        PredictionCreationException.class,
                        failure -> {
                            assertThat(failure.outcome())
                                    .isEqualTo(
                                            TaskPredictionAttemptOutcome
                                                    .HTTP_ERROR);
                            assertThat(failure.retryable()).isFalse();
                            assertThat(failure.httpStatus()).isEqualTo(422);
                        });
    }

    @Test
    void timeoutIsRetryable() {
        var adapter = new LocalTaskPredictionFakeCreationAdapter(properties(
                LocalTaskPredictionProperties.Scenario.TIMEOUT));

        assertThatThrownBy(() -> adapter.create(command()))
                .isInstanceOfSatisfying(
                        PredictionCreationException.class,
                        failure -> {
                            assertThat(failure.outcome())
                                    .isEqualTo(
                                            TaskPredictionAttemptOutcome
                                                    .TIMEOUT);
                            assertThat(failure.retryable()).isTrue();
                            assertThat(failure.httpStatus()).isNull();
                        });
    }

    private static PredictionCreationCommand command() {
        return new PredictionCreationCommand(
                REQUEST_ID,
                new TaskPersonaId("local-persona"),
                LocalTaskFixtureAccess.openTask(),
                "candidate-policy-v1",
                1,
                "{}",
                TaskPredictionInputSnapshot.fingerprint("{}"),
                Duration.ofSeconds(60));
    }

    private static LocalTaskPredictionProperties properties(
            LocalTaskPredictionProperties.Scenario scenario
    ) {
        LocalTaskPredictionProperties properties =
                new LocalTaskPredictionProperties();
        properties.setScenario(scenario);
        return properties;
    }

    private static final class LocalTaskFixtureAccess {
        private static Task openTask() {
            Task task = LocalTaskFixture.draft();
            task.openImmediately(
                    LocalTaskFixture.HISTORY_ID,
                    LocalTaskFixture.CLOSE_AT,
                    LocalTaskFixture.ACTOR,
                    LocalTaskFixture.OPEN_REASON,
                    LocalTaskFixture.CREATED_AT);
            return task;
        }
    }
}
