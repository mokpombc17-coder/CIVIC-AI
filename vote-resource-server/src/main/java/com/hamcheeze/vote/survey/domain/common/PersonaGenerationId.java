package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record PersonaGenerationId(UUID value) implements SurveyId {

    public PersonaGenerationId {
        value = SurveyIdSupport.require(
                value,
                "PERSONA_GENERATION_ID_REQUIRED",
                "generationId");
    }
}
