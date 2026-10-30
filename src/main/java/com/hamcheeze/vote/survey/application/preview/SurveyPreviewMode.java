package com.hamcheeze.vote.survey.application.preview;

import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public final class SurveyPreviewMode {

    private final Set<String> userIds;

    public SurveyPreviewMode(
            @Value("${vote.survey.preview.user-ids:}")
            String configuredUserIds
    ) {
        userIds = Arrays.stream(Objects.requireNonNull(
                        configuredUserIds,
                        "configuredUserIds").split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public static SurveyPreviewMode disabled() {
        return new SurveyPreviewMode("");
    }

    public boolean enabledFor(SurveyUserId userId) {
        return userIds.contains(Objects.requireNonNull(
                userId, "userId").value());
    }
}
