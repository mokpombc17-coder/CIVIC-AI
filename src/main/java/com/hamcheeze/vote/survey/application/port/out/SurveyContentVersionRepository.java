package com.hamcheeze.vote.survey.application.port.out;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;

import java.util.List;
import java.util.Optional;

public interface SurveyContentVersionRepository {

    SurveyContentVersion save(SurveyContentVersion contentVersion);

    Optional<SurveyContentVersion> findById(
            SurveyContentVersionId contentVersionId);

    List<SurveyContentVersion> findAll();

    Optional<SurveyContentVersion> findPublishedByVersionNumber(
            SurveyContentVersionNumber versionNumber);
}
