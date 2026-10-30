package com.hamcheeze.vote.survey.application.port.out;

import com.hamcheeze.vote.survey.application.integration.SurveyResponseSubmittedReplayAudit;

import java.util.Optional;
import java.util.UUID;

public interface SurveyResponseSubmittedReplayAuditRepository {

    SurveyResponseSubmittedReplayAudit insert(
            SurveyResponseSubmittedReplayAudit audit);

    Optional<SurveyResponseSubmittedReplayAudit> findByOriginalEventId(
            UUID originalEventId);
}
