package com.hamcheeze.vote.task.application.submission;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

@Component
public class TaskSubmissionMetrics {

    private final Counter directWithoutPrediction;
    private final Counter directWhilePredictionNonTerminal;
    private final Counter aiAccepted;

    public TaskSubmissionMetrics(MeterRegistry registry) {
        directWithoutPrediction = registry.counter(
                "vote.task.submission.direct.without.prediction");
        directWhilePredictionNonTerminal = registry.counter(
                "vote.task.submission.direct.prediction.nonterminal");
        aiAccepted = registry.counter(
                "vote.task.submission.ai.accepted");
    }

    public void directWithoutPrediction() {
        directWithoutPrediction.increment();
    }

    public void directWhilePredictionNonTerminal() {
        directWhilePredictionNonTerminal.increment();
    }

    public void aiAccepted() {
        aiAccepted.increment();
    }
}
