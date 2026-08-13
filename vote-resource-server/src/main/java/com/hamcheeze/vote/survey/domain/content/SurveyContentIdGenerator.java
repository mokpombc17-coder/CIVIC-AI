package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;

public interface SurveyContentIdGenerator {

    SurveyQuestionId nextQuestionId();

    SurveyOptionId nextOptionId();
}
