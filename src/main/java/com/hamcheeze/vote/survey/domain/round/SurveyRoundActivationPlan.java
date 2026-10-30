package com.hamcheeze.vote.survey.domain.round;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

public record SurveyRoundActivationPlan(
        SurveyRound targetRound,
        Optional<SurveyRound> closedRound,
        List<SurveyRoundTransition> transitions,
        boolean changed
) {

    public SurveyRoundActivationPlan {
        Objects.requireNonNull(targetRound, "targetRound");
        closedRound = Objects.requireNonNull(closedRound, "closedRound");
        transitions = List.copyOf(
                Objects.requireNonNull(transitions, "transitions"));
        if (changed == transitions.isEmpty()) {
            throw new IllegalArgumentException(
                    "changed plan must contain transitions");
        }
    }

    static SurveyRoundActivationPlan changed(
            SurveyRound targetRound,
            SurveyRound closedRound,
            List<SurveyRoundTransition> transitions
    ) {
        return new SurveyRoundActivationPlan(
                targetRound,
                Optional.ofNullable(closedRound),
                transitions,
                true);
    }

    static SurveyRoundActivationPlan unchanged(SurveyRound targetRound) {
        return new SurveyRoundActivationPlan(
                targetRound,
                Optional.empty(),
                List.of(),
                false);
    }
}
