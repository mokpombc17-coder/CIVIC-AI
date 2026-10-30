package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.application.PersonaGenerationInputSnapshot;
import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;

import java.time.Instant;

public interface PersonaGenerationInputSnapshotFactory {

    PersonaGenerationInputSnapshot create(
            PersonaGenerationId generationId,
            PersonaSurveySource source,
            Instant createdAt);
}
