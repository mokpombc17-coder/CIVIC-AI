package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaCreationCommand;
import com.hamcheeze.vote.persona.application.PersonaGenerationInputException;
import com.hamcheeze.vote.persona.application.PersonaGenerationInputSnapshot;
import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationInputSnapshotFactory;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.Objects;

@Component
public class PersonaGenerationInputSnapshotFactoryAdapter
        implements PersonaGenerationInputSnapshotFactory {

    private final ObjectMapper objectMapper;

    public PersonaGenerationInputSnapshotFactoryAdapter(
            ObjectMapper objectMapper
    ) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    public PersonaGenerationInputSnapshot create(
            PersonaGenerationId generationId,
            PersonaSurveySource source,
            Instant createdAt
    ) {
        Objects.requireNonNull(generationId, "generationId");
        Objects.requireNonNull(source, "source");
        try {
            int schemaVersion = PersonaCreationCommand.CURRENT_SCHEMA_VERSION;
            String payload = objectMapper.writeValueAsString(
                    PersonaProviderRequestJson.from(
                            generationId, schemaVersion, source));
            return PersonaGenerationInputSnapshot.create(
                    generationId,
                    source.responseId(),
                    source.userId(),
                    schemaVersion,
                    payload,
                    createdAt);
        } catch (RuntimeException exception) {
            throw new PersonaGenerationInputException(
                    PersonaGenerationInputException.ErrorCode.INTEGRITY_ERROR,
                    "Persona generation input could not be serialized",
                    exception);
        }
    }
}
