package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;

public interface PersonaSurveySourceQueryPort {

    PersonaSurveySource getByResponseId(PersonaSourceId responseId);
}
