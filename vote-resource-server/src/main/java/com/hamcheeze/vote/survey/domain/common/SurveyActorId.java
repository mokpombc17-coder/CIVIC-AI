package com.hamcheeze.vote.survey.domain.common;

public record SurveyActorId(String value) {

    public SurveyActorId {
        if (value == null || value.isBlank()) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ACTOR_ID_REQUIRED",
                    "actorId",
                    "actorId must not be blank");
        }
        value = value.strip();
    }
}
