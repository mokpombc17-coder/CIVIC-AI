package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.task.Task;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.actorId;
import static com.hamcheeze.vote.task.TaskTestFixtures.historyId;
import static com.hamcheeze.vote.task.TaskTestFixtures.openTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.pendingPrediction;
import static com.hamcheeze.vote.task.TaskTestFixtures.validCandidates;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskPredictionDispatcherTest {

    private static final Instant DISPATCH_TIME = NOW.plusSeconds(20);

    private TaskPrediction prediction;
    private AtomicReference<Task> task;
    private Map<UUID, TaskPredictionAttempt> attempts;
    private TaskPredictionStateService states;
    private TaskPredictionApplicationPolicy policy;

    @BeforeEach
    void setUp() {
        prediction = pendingPrediction();
        task = new AtomicReference<>(openTask());
        attempts = new LinkedHashMap<>();
        policy = new TaskPredictionApplicationPolicy(
                "candidate-policy-v1",
                new TaskPredictionRetryPolicy(
                        Duration.ofSeconds(60),
                        2,
                        Duration.ZERO),
                10);

        TaskPredictionRepository predictions =
                mock(TaskPredictionRepository.class);
        TaskRepository tasks = mock(TaskRepository.class);
        when(tasks.findById(any())).thenAnswer(
                ignored -> Optional.of(task.get()));
        when(predictions.findNextDispatchableForUpdate(any()))
                .thenAnswer(invocation -> {
                    Instant dueAt = invocation.getArgument(0);
                    if (prediction.status() == TaskPredictionStatus.PENDING) {
                        return Optional.of(prediction);
                    }
                    if (prediction.status()
                            == TaskPredictionStatus.RETRY_WAIT
                            && !prediction.nextRetryAt().isAfter(dueAt)) {
                        return Optional.of(prediction);
                    }
                    return Optional.empty();
                });
        when(predictions.findByIdForUpdate(any(TaskPredictionId.class)))
                .thenAnswer(ignored -> Optional.of(prediction));
        when(predictions.save(any(TaskPrediction.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(predictions.saveAttempt(any(TaskPredictionAttempt.class)))
                .thenAnswer(invocation -> {
                    TaskPredictionAttempt attempt = invocation.getArgument(0);
                    attempts.put(attempt.id().value(), attempt);
                    return attempt;
                });
        when(predictions.findAttempts(any(TaskPredictionId.class)))
                .thenAnswer(ignored -> attempts.values().stream()
                        .sorted(Comparator.comparingInt(
                                TaskPredictionAttempt::attemptNumber))
                        .toList());
        states = new TaskPredictionStateService(
                predictions,
                tasks,
                policy,
                Clock.fixed(DISPATCH_TIME, ZoneOffset.UTC));
    }

    @Test
    void dispatchesEveryClaimInOneBatchExactlyOnce() {
        TaskPredictionStateService claimedStates =
                mock(TaskPredictionStateService.class);
        PredictionCreationPort creation = mock(PredictionCreationPort.class);
        TaskPredictionDispatchClaim first = dispatchClaim();
        TaskPredictionDispatchClaim second = dispatchClaim();
        when(claimedStates.claimNext())
                .thenReturn(Optional.of(first))
                .thenReturn(Optional.of(second))
                .thenReturn(Optional.empty());
        when(creation.create(any())).thenAnswer(invocation -> {
            PredictionCreationCommand command = invocation.getArgument(0);
            return new PredictionCreationResult(
                    command.requestId(),
                    command.task().id(),
                    List.of(),
                    200,
                    responsePayload());
        });
        TaskPredictionDispatcher dispatcher = new TaskPredictionDispatcher(
                claimedStates, creation, policy);

        assertThat(dispatcher.dispatchAvailable()).isEqualTo(2);

        verify(claimedStates, times(3)).claimNext();
        verify(creation).create(first.command());
        verify(creation).create(second.command());
        verify(claimedStates, times(2)).completeSuccess(any(), any());
    }

    @Test
    void fakePortRunsFromScreenEntryPendingStateToReadyCandidates() {
        PredictionCreationPort port = command -> success(command, 200);
        TaskPredictionDispatcher dispatcher =
                new TaskPredictionDispatcher(states, port, policy);

        assertThat(dispatcher.dispatchAvailable()).isEqualTo(1);

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.SUCCEEDED);
        assertThat(prediction.predictedReasons()).hasSize(4);
        assertThat(attempts.values())
                .singleElement()
                .extracting(TaskPredictionAttempt::outcome)
                .isEqualTo(TaskPredictionAttemptOutcome.SUCCEEDED);
    }

    @Test
    void retryableTimeoutUsesSameRequestIdAndEventuallyFallsBack() {
        List<TaskPredictionId> requestIds = new ArrayList<>();
        PredictionCreationPort port = command -> {
            requestIds.add(command.requestId());
            throw timeout();
        };
        TaskPredictionDispatcher dispatcher =
                new TaskPredictionDispatcher(states, port, policy);

        assertThat(dispatcher.dispatchAvailable()).isEqualTo(2);

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.FAILED);
        assertThat(requestIds).containsExactly(
                prediction.requestId(), prediction.requestId());
        assertThat(attempts.values())
                .extracting(TaskPredictionAttempt::outcome)
                .containsExactly(
                        TaskPredictionAttemptOutcome.TIMEOUT,
                        TaskPredictionAttemptOutcome.TIMEOUT);
    }

    @Test
    void duplicateTerminalResponseIsAuditOnly() {
        TaskPredictionDispatchClaim claim = states.claimNext().orElseThrow();
        PredictionCreationResult result = success(claim.command(), 200);

        assertThat(states.completeSuccess(claim, result)).isTrue();
        assertThat(states.completeSuccess(claim, result)).isFalse();

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.SUCCEEDED);
        assertThat(attempts.values())
                .extracting(TaskPredictionAttempt::outcome)
                .containsExactly(
                        TaskPredictionAttemptOutcome.SUCCEEDED,
                        TaskPredictionAttemptOutcome.IGNORED_LATE_RESPONSE);
    }

    @Test
    void responseAfterTaskClosureIsPreserved() {
        TaskPredictionDispatchClaim claim = states.claimNext().orElseThrow();
        Task closed = openTask();
        closed.closeEarly(
                historyId(99), actorId(), "closed while AI was working",
                NOW.plusSeconds(30));
        task.set(closed);

        assertThat(states.completeSuccess(
                claim, success(claim.command(), 200))).isTrue();

        assertThat(task.get().status().name()).isEqualTo("CLOSED");
        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.SUCCEEDED);
        assertThat(prediction.predictedReasons()).isNotEmpty();
    }

    @Test
    void mismatchedResponseBecomesTerminalInvalidResponse() {
        TaskPredictionDispatchClaim claim = states.claimNext().orElseThrow();
        PredictionCreationResult mismatched = new PredictionCreationResult(
                new TaskPredictionId(UUID.randomUUID()),
                claim.command().task().id(),
                validCandidates(2),
                200,
                responsePayload());

        assertThat(states.completeSuccess(claim, mismatched)).isTrue();

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.FAILED);
        assertThat(prediction.lastError().code())
                .isEqualTo("AI_RESPONSE_INVALID");
        assertThat(attempts.values())
                .singleElement()
                .extracting(TaskPredictionAttempt::outcome)
                .isEqualTo(TaskPredictionAttemptOutcome.INVALID_RESPONSE);
    }

    @Test
    void incompleteCandidateSetNeverBecomesPartiallySuccessful() {
        TaskPredictionDispatchClaim claim = states.claimNext().orElseThrow();
        PredictionCreationResult incomplete = new PredictionCreationResult(
                claim.command().requestId(),
                claim.command().task().id(),
                validCandidates(2).subList(0, 1),
                200,
                responsePayload());

        assertThat(states.completeSuccess(claim, incomplete)).isTrue();

        assertThat(prediction.status())
                .isEqualTo(TaskPredictionStatus.FAILED);
        assertThat(prediction.predictedReasons()).isEmpty();
        assertThat(prediction.lastError().code())
                .isEqualTo("AI_RESPONSE_INVALID");
        assertThat(attempts.values())
                .singleElement()
                .extracting(TaskPredictionAttempt::outcome)
                .isEqualTo(TaskPredictionAttemptOutcome.INVALID_RESPONSE);
    }

    private TaskPredictionDispatchClaim dispatchClaim() {
        TaskPredictionId predictionId = new TaskPredictionId(
                UUID.randomUUID());
        PredictionCreationCommand command = new PredictionCreationCommand(
                predictionId,
                new TaskPersonaId("persona-" + UUID.randomUUID()),
                openTask(),
                policy.candidatePolicyVersion(),
                policy.retryPolicy().requestTimeout());
        return new TaskPredictionDispatchClaim(
                predictionId,
                new TaskPredictionAttemptId(UUID.randomUUID()),
                1,
                command,
                SanitizedTaskPredictionPayload.fromSanitized(
                        "{\"request\":\"multi-claim\"}"));
    }

    private static PredictionCreationResult success(
            PredictionCreationCommand command,
            int status
    ) {
        return new PredictionCreationResult(
                command.requestId(),
                command.task().id(),
                validCandidates(2),
                status,
                responsePayload());
    }

    private static PredictionCreationException timeout() {
        return new PredictionCreationException(
                TaskPredictionAttemptOutcome.TIMEOUT,
                true,
                null,
                "AI_TIMEOUT",
                "prediction request timed out",
                null,
                null);
    }

    private static SanitizedTaskPredictionPayload responsePayload() {
        return SanitizedTaskPredictionPayload.fromSanitized(
                "{\"model\":\"fake\",\"candidateCount\":8}");
    }
}
