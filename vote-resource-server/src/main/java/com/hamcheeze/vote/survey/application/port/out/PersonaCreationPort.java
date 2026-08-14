package com.hamcheeze.vote.survey.application.port.out;

import com.hamcheeze.vote.survey.application.persona.PersonaCreationCommand;
import com.hamcheeze.vote.survey.application.persona.PersonaCreationResult;

public interface PersonaCreationPort {

    PersonaCreationResult create(PersonaCreationCommand command);
}
