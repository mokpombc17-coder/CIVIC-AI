package com.hamcheeze.vote.survey.domain.round;

public enum SurveyRoundActivationKind {
    FIRST,
    SUBSEQUENT;

    SurveyRoundEnforcementMode initialEnforcementMode() {
        return this == FIRST
                ? SurveyRoundEnforcementMode.REQUIRED
                : SurveyRoundEnforcementMode.ADVISORY;
    }
}
