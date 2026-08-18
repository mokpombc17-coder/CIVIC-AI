package com.hamcheeze.vote.persona.application.port.in;

import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;

public interface PersonaSurveySourceQueryPort {

    PersonaSurveySource getByResponseId(PersonaSourceId responseId);

    default PersonaSurveySource getByResponseId(
            SurveyResponseId responseId
    ) {
        return getByResponseId(new PersonaSourceId(responseId.value()));
    }
}
