package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.application.bootstrap.LocalSurveyFixture;
import com.hamcheeze.vote.survey.application.bootstrap.RoundOneSurveyFixture;
import org.junit.jupiter.api.Test;

import java.util.List;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveyApiModelsTest {

    @Test
    void defaultsOmittedRequiredToTrue() {
        SurveyQuestion question = questionRequest(null).toDomain();

        assertThat(question.required()).isTrue();
        assertThat(SurveyApiModels.QuestionResponse.from(question).required())
                .isTrue();
    }

    @Test
    void rejectsExplicitOptionalQuestion() {
        assertThatThrownBy(() -> questionRequest(false).toDomain())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("required must be true");
    }

    @Test
    void exposesPublishedContentAsTwentyNineQuestions() {
        SurveyApiModels.PublishedContentResponse response =
                SurveyApiModels.PublishedContentResponse.from(
                        LocalSurveyFixture.publishedContent());

        assertThat(response.sections())
                .hasSize(RoundOneSurveyFixture.SECTION_COUNT);
        assertThat(response.sections())
                .extracting(SurveyApiModels.QuestionSectionResponse::title)
                .containsExactly(
                        "일반 개인정보",
                        "가구 정보",
                        "생활 · 경제",
                        "가치 · 정치 성향",
                        "미디어 · 의견 성향",
                        "사회 · 기관 신뢰",
                        "매체 이용 · 정보 습관");
        List<SurveyApiModels.PublishedQuestionResponse> questions =
                response.sections().stream()
                        .flatMap(section -> section.questions().stream())
                        .toList();
        assertThat(questions).hasSize(RoundOneSurveyFixture.QUESTION_COUNT);
        assertThat(questions.get(4).items())
                .extracting(SurveyApiModels.QuestionItemResponse::itemKey)
                .containsExactly(
                        "infant", "preschool", "elementary-school",
                        "middle-school", "high-school", "senior");
        assertThat(questions.get(15).options())
                .extracting(
                        SurveyApiModels.PublishedOptionResponse::optionLocalKey)
                .containsExactly("A", "B", "C", "D");
    }

    @Test
    void exposesOnlyFrontendRequiredContentIdentifiers() {
        SurveyApiModels.PublishedContentResponse response =
                SurveyApiModels.PublishedContentResponse.from(
                        LocalSurveyFixture.publishedContent());

        JsonNode content = new ObjectMapper().valueToTree(response);
        JsonNode section = content.path("sections").get(0);
        JsonNode question = section.path("questions").get(0);
        JsonNode option = content.path("sections").get(1)
                .path("questions").get(1)
                .path("options").get(0);

        assertThat(section.has("sectionId")).isFalse();
        assertThat(section.has("sectionLineageId")).isFalse();
        assertThat(question.has("questionLineageId")).isFalse();
        assertThat(option.has("optionLineageId")).isFalse();

        assertThat(section.path("sectionKey").asText()).isNotBlank();
        assertThat(question.path("questionId").asText()).isNotBlank();
        assertThat(question.path("questionKey").asText()).isNotBlank();
        assertThat(option.path("optionId").asText()).isNotBlank();
        assertThat(option.path("optionLocalKey").asText()).isNotBlank();
    }

    private SurveyApiModels.QuestionWriteRequest questionRequest(
            Boolean required
    ) {
        return new SurveyApiModels.QuestionWriteRequest(
                null,
                null,
                SurveyQuestionType.SHORT_TEXT,
                "질문",
                null,
                1,
                required,
                new SurveyApiModels.RuleRequest(
                        null, null, 200, null, null,
                        null, null, null, null),
                false,
                List.of());
    }
}
