package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;

import java.util.Optional;

public interface PersonaSurveySourceQueryPort {

    PersonaSurveySource getByResponseId(PersonaSourceId responseId);

    Optional<PersonaSourceId> findLatestSourceIdByUserId(
            PersonaUserId userId);
}
