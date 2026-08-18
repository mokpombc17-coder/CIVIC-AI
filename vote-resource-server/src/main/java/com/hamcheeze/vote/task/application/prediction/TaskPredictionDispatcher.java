package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.Optional;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.prediction",
        name = "enabled",
        havingValue = "true")
public class TaskPredictionDispatcher {

    private static final Logger log = LoggerFactory.getLogger(
            TaskPredictionDispatcher.class);

    private final TaskPredictionStateService states;
    private final PredictionCreationPort predictionCreation;
    private final TaskPredictionApplicationPolicy policy;

    public TaskPredictionDispatcher(
            TaskPredictionStateService states,
            PredictionCreationPort predictionCreation,
            TaskPredictionApplicationPolicy policy
    ) {
        this.states = Objects.requireNonNull(states, "states");
        this.predictionCreation = Objects.requireNonNull(
                predictionCreation, "predictionCreation");
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    @Scheduled(fixedDelayString =
            "${vote.task.prediction.dispatcher-delay:5s}")
    public void dispatchScheduled() {
        dispatchAvailable();
    }

    public int dispatchAvailable() {
        int dispatched = 0;
        for (int index = 0; index < policy.batchSize(); index++) {
            Optional<TaskPredictionDispatchClaim> claimed =
                    states.claimNext();
            if (claimed.isEmpty()) {
                break;
            }
            dispatch(claimed.get());
            dispatched++;
        }
        return dispatched;
    }

    private void dispatch(TaskPredictionDispatchClaim claim) {
        try {
            PredictionCreationResult result = predictionCreation.create(
                    claim.command());
            states.completeSuccess(claim, result);
        } catch (PredictionCreationException exception) {
            states.completeFailure(claim, exception);
            log.warn(
                    "Task prediction creation failed: predictionId={}, code={}, retryable={}",
                    claim.predictionId().value(),
                    exception.errorCode(),
                    exception.retryable());
        } catch (RuntimeException exception) {
            PredictionCreationException failure =
                    new PredictionCreationException(
                            TaskPredictionAttemptOutcome.NETWORK_ERROR,
                            true,
                            null,
                            "PREDICTION_CREATION_INTERNAL_ERROR",
                            "prediction creation call failed unexpectedly",
                            null,
                            exception);
            states.completeFailure(claim, failure);
            log.warn(
                    "Task prediction creation failed unexpectedly: predictionId={}",
                    claim.predictionId().value(),
                    exception);
        }
    }
}
