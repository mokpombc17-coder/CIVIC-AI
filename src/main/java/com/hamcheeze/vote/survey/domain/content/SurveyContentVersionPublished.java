package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;

import java.time.Instant;
import java.util.Objects;

public record SurveyContentVersionPublished(
        SurveyContentVersionId contentVersionId,
        SurveyContentVersionNumber versionNumber,
        SurveyActorId publishedBy,
        Instant publishedAt
) {

    public SurveyContentVersionPublished {
        Objects.requireNonNull(contentVersionId, "contentVersionId");
        Objects.requireNonNull(versionNumber, "versionNumber");
        Objects.requireNonNull(publishedBy, "publishedBy");
        Objects.requireNonNull(publishedAt, "publishedAt");
    }
}
