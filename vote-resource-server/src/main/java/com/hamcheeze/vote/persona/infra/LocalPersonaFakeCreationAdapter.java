package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaCreationCommand;
import com.hamcheeze.vote.persona.application.PersonaCreationResult;
import com.hamcheeze.vote.persona.application.port.out.PersonaCreationPort;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;

public class LocalPersonaFakeCreationAdapter
        implements PersonaCreationPort {

    @Override
    public PersonaCreationResult create(PersonaCreationCommand command) {
        Objects.requireNonNull(command, "command");
        UUID personaId = UUID.nameUUIDFromBytes(
                ("local-persona:" + command.generationId().value())
                        .getBytes(StandardCharsets.UTF_8));
        return new PersonaCreationResult(
                command.generationId(),
                new PersonaId(personaId.toString()),
                new PredictedAdoptionRate(new BigDecimal("0.5")),
                new PersonaModelVersion("local-fake-v1"));
    }
}
