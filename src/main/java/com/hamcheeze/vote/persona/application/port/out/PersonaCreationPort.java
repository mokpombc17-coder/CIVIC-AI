package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.application.PersonaCreationCommand;
import com.hamcheeze.vote.persona.application.PersonaCreationResult;

public interface PersonaCreationPort {

    PersonaCreationResult create(PersonaCreationCommand command);
}
