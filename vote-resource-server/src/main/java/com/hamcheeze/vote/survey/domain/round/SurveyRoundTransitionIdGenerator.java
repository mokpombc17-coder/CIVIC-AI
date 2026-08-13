package com.hamcheeze.vote.survey.domain.round;

import com.hamcheeze.vote.survey.domain.common.SurveyRoundTransitionId;

public interface SurveyRoundTransitionIdGenerator {

    SurveyRoundTransitionId nextTransitionId();
}
