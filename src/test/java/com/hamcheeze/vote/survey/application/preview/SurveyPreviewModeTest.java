package com.hamcheeze.vote.survey.application.preview;

import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SurveyPreviewModeTest {

    @Test
    void enablesOnlyExplicitlyConfiguredUsers() {
        SurveyPreviewMode mode = new SurveyPreviewMode(
                "local-user-1, local-user-2");

        assertThat(mode.enabledFor(new SurveyUserId("local-user-1")))
                .isTrue();
        assertThat(mode.enabledFor(new SurveyUserId("local-user-2")))
                .isTrue();
        assertThat(mode.enabledFor(new SurveyUserId("other-user")))
                .isFalse();
        assertThat(SurveyPreviewMode.disabled().enabledFor(
                new SurveyUserId("local-user-1"))).isFalse();
    }
}
