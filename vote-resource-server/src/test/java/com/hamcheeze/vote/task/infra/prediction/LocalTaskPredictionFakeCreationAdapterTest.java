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
import java.util.List;
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
    void stagingUsersReceiveDistinctTwoSentenceReasons() {
        var adapter = new LocalTaskPredictionFakeCreationAdapter(properties(
                LocalTaskPredictionProperties.Scenario.SUCCESS));
        List<String> userIds = List.of(
                "46fd4756-f07f-4b54-b03a-6e07740317da",
                "4af25cff-f0ad-4a43-ad4f-5f556dcdff5b",
                "89074124-2d0f-4cc1-b14e-8e8a3c5e933f",
                "7f099599-04a3-4d25-9798-15a491e1ff32",
                "77b1499c-6951-4242-8ce8-d8a5b9d31621",
                "69230d56-11b5-42dd-9eea-a8116c005fc5",
                "352e7eab-ed90-4c7f-8628-483c4a5404aa",
                "cbf68442-aa94-4502-9911-9e1e348214b8",
                "74d8b3c6-86ed-44bd-abf6-8af36f21d753");

        List<List<String>> reasonsByUser = userIds.stream()
                .map(userId -> adapter.create(command(userId))
                        .predictedReasons().stream()
                        .map(reason -> reason.reason())
                        .toList())
                .toList();

        assertThat(reasonsByUser).doesNotHaveDuplicates();
        assertThat(reasonsByUser).allSatisfy(reasons -> {
            assertThat(reasons).hasSize(6);
            assertThat(reasons).allSatisfy(reason -> assertThat(reason)
                    .matches("(?s)[^.]+\\. [^.]+\\."));
        });
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
        return command("local-user");
    }

    private static PredictionCreationCommand command(String userId) {
        return new PredictionCreationCommand(
                REQUEST_ID,
                new com.hamcheeze.vote.task.domain.common.TaskUserId(
                        userId),
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
