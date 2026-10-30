package com.hamcheeze.vote.survey.domain.round;

import java.util.Objects;
import java.util.Optional;

public record SurveyRoundMutation(
        SurveyRound round,
        Optional<SurveyRoundTransition> transition,
        boolean changed
) {

    public SurveyRoundMutation {
        Objects.requireNonNull(round, "round");
        transition = Objects.requireNonNull(transition, "transition");
        if (changed != transition.isPresent()) {
            throw new IllegalArgumentException(
                    "changed mutation must have exactly one transition");
        }
    }

    static SurveyRoundMutation changed(
            SurveyRound round,
            SurveyRoundTransition transition
    ) {
        return new SurveyRoundMutation(
                round,
                Optional.of(transition),
                true);
    }

    static SurveyRoundMutation unchanged(SurveyRound round) {
        return new SurveyRoundMutation(round, Optional.empty(), false);
    }
}
