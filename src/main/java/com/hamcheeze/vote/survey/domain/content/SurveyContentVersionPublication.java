package com.hamcheeze.vote.survey.domain.content;

import java.util.Objects;

public record SurveyContentVersionPublication(
        SurveyContentVersion contentVersion,
        SurveyContentVersionPublished event
) {

    public SurveyContentVersionPublication {
        Objects.requireNonNull(contentVersion, "contentVersion");
        Objects.requireNonNull(event, "event");
        if (contentVersion.status() != SurveyContentVersionStatus.PUBLISHED) {
            throw new IllegalArgumentException(
                    "published content version is required");
        }
    }
}
