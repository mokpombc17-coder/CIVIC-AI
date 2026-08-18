package com.hamcheeze.vote.task.infra.prediction;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("vote.task.prediction.fake")
public class LocalTaskPredictionProperties {

    public enum Scenario {
        SUCCESS,
        FINAL_FAILURE,
        TIMEOUT
    }

    private Scenario scenario = Scenario.SUCCESS;

    public Scenario getScenario() {
        return scenario;
    }

    public void setScenario(Scenario scenario) {
        this.scenario = scenario;
    }
}
