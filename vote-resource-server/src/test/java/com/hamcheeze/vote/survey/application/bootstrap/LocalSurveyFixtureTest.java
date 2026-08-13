package com.hamcheeze.vote.survey.application.bootstrap;

import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import com.hamcheeze.vote.survey.domain.content.SurveyOptionKind;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class LocalSurveyFixtureTest {

    @Test
    void definesCanonicalFifteenQuestionLocalSampleWithFixedIds() {
        List<SurveyQuestion> first = LocalSurveyFixture.questions();
        List<SurveyQuestion> second = LocalSurveyFixture.questions();

        assertThat(first).hasSize(15);
        assertThat(first).allMatch(SurveyQuestion::required);
        assertThat(first)
                .extracting(SurveyQuestion::displayOrder)
                .containsExactly(
                        1, 2, 3, 4, 5, 6, 7, 8,
                        9, 10, 11, 12, 13, 14, 15);
        assertThat(first)
                .extracting(SurveyQuestion::type)
                .containsAll(EnumSet.allOf(SurveyQuestionType.class));
        assertThat(first.stream()
                .flatMap(question -> question.options().stream())
                .filter(option -> option.kind() == SurveyOptionKind.OTHER))
                .hasSize(2);
        assertThat(second)
                .extracting(SurveyQuestion::id)
                .containsExactlyElementsOf(first.stream()
                        .map(SurveyQuestion::id)
                        .toList());
        assertThat(second)
                .extracting(SurveyQuestion::lineageKey)
                .containsExactlyElementsOf(first.stream()
                        .map(SurveyQuestion::lineageKey)
                        .toList());

        var published = LocalSurveyFixture.publishedContent();
        assertThat(published.status())
                .isEqualTo(SurveyContentVersionStatus.PUBLISHED);
        assertThat(published.versionNumber())
                .contains(LocalSurveyFixture.CONTENT_VERSION_NUMBER);
        assertThat(published.name()).startsWith("[LOCAL]");
        assertThat(published.description()).hasValueSatisfying(
                description -> assertThat(description)
                        .contains("운영 질문으로 사용하지 않습니다"));
    }
}
