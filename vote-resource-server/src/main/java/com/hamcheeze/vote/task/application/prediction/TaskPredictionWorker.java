package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.Optional;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.prediction",
        name = "enabled",
        havingValue = "true")
public class TaskPredictionWorker {

    private static final Logger log = LoggerFactory.getLogger(
            TaskPredictionWorker.class);

    private final TaskPredictionStateService states;
    private final PredictionCreationPort predictionCreation;

    public TaskPredictionWorker(
            TaskPredictionStateService states,
            PredictionCreationPort predictionCreation
    ) {
        this.states = Objects.requireNonNull(states, "states");
        this.predictionCreation = Objects.requireNonNull(
                predictionCreation, "predictionCreation");
    }

    public boolean executeOne() {
        Optional<TaskPredictionDispatchClaim> claimed = states.claimNext(
                Thread.currentThread().getName());
        if (claimed.isEmpty()) {
            return false;
        }
        executeClaim(claimed.orElseThrow());
        return true;
    }

    void executeClaim(TaskPredictionDispatchClaim claim) {
        try {
            PredictionCreationResult result = predictionCreation.create(
                    claim.command());
            states.completeSuccess(claim, result);
        } catch (PredictionRemoteProcessingException exception) {
            states.completeRemoteProcessing(claim, exception);
            log.info(
                    "Task prediction is still processing remotely: predictionId={}, attemptId={}, attemptNumber={}, code={}",
                    claim.predictionId().value(), claim.attemptId().value(),
                    claim.attemptNumber(), exception.runtimeStatus().code());
        } catch (PredictionCreationException exception) {
            states.completeFailure(claim, exception);
            log.warn(
                    "Task prediction failed: predictionId={}, attemptId={}, attemptNumber={}, code={}, retryable={}",
                    claim.predictionId().value(), claim.attemptId().value(),
                    claim.attemptNumber(), exception.errorCode(),
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
                    "Task prediction failed unexpectedly: predictionId={}, attemptId={}, attemptNumber={}",
                    claim.predictionId().value(), claim.attemptId().value(),
                    claim.attemptNumber());
        }
    }
}
