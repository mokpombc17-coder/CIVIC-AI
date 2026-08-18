package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaCreationCommand;
import com.hamcheeze.vote.persona.application.PersonaCreationResult;
import com.hamcheeze.vote.persona.application.port.out.PersonaCreationPort;
import com.hamcheeze.vote.persona.domain.PersonaId;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;

@Component
@Profile("local")
@ConditionalOnProperty(
        prefix = "vote.survey.persona",
        name = "provider",
        havingValue = "fake")
public class LocalPersonaFakeCreationAdapter
        implements PersonaCreationPort {

    @Override
    public PersonaCreationResult create(PersonaCreationCommand command) {
        Objects.requireNonNull(command, "command");
        UUID personaId = UUID.nameUUIDFromBytes(
                ("local-persona:" + command.generationId().value())
                        .getBytes(StandardCharsets.UTF_8));
        return new PersonaCreationResult(
                command.generationId(), new PersonaId(personaId.toString()));
    }
}
