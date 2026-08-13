package com.hamcheeze.vote.survey.application.port.in;

import com.hamcheeze.vote.survey.application.persona.PersonaSurveySource;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;

public interface PersonaSurveySourceQueryPort {

    PersonaSurveySource getByResponseId(SurveyResponseId responseId);
}
