package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionGroupId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionSectionId;

public interface SurveyContentIdGenerator {

    SurveyQuestionSectionId nextQuestionSectionId();

    SurveyQuestionGroupId nextQuestionGroupId();

    SurveyQuestionId nextQuestionId();

    SurveyOptionId nextOptionId();
}
