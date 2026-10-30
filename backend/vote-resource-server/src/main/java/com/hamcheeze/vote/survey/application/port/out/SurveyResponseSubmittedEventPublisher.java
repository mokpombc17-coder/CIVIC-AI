package com.hamcheeze.vote.survey.application.port.out;

import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.response.SurveyResponseSubmitted;

public interface SurveyResponseSubmittedEventPublisher {

    void publish(
            SurveyUserId userId,
            SurveyResponseSubmitted event
    );
}
