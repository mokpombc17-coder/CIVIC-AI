package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.application.bootstrap.LocalSurveyFixture;
import com.hamcheeze.vote.survey.application.bootstrap.RoundOneSurveyFixture;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.response.OptionSelection;
import com.hamcheeze.vote.survey.domain.response.SingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SurveyApiModelsTest {

    @Test
    void defaultsOmittedRequiredToTrue() {
        SurveyQuestion question = questionRequest(null).toDomain();

        assertThat(question.required()).isTrue();
        assertThat(SurveyApiModels.QuestionResponse.from(question).required())
                .isTrue();
    }

    @Test
    void acceptsExplicitOptionalQuestion() {
        SurveyQuestion question = questionRequest(false).toDomain();

        assertThat(question.required()).isFalse();
    }

    @Test
    void exposesPublishedContentAsTwentyNineQuestions() {
        List<SurveyApiModels.QuestionSectionResponse> sections =
                SurveyApiModels.sectionsFrom(
                        LocalSurveyFixture.publishedContent());

        assertThat(sections)
                .hasSize(RoundOneSurveyFixture.SECTION_COUNT);
        assertThat(sections)
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
                sections.stream()
                        .flatMap(section -> section.questions().stream())
                        .toList();
        assertThat(questions).hasSize(RoundOneSurveyFixture.QUESTION_COUNT);
        SurveyApiModels.MatrixSingleChoiceQuestionResponse family =
                (SurveyApiModels.MatrixSingleChoiceQuestionResponse)
                        questions.get(4);
        assertThat(family.items())
                .extracting(
                        SurveyApiModels.PublishedQuestionItemResponse::itemKey)
                .containsExactly(
                        "infant", "preschool", "elementary-school",
                        "middle-school", "high-school", "senior");
        SurveyApiModels.SingleChoiceQuestionResponse interest =
                (SurveyApiModels.SingleChoiceQuestionResponse)
                        questions.get(15);
        assertThat(interest.options())
                .extracting(SurveyApiModels.PublishedOptionResponse::label)
                .containsExactly(
                        "매우 관심이 있다", "약간 관심이 있다",
                        "별로 관심이 없다", "전혀 관심이 없다");
    }

    @Test
    void exposesOnlyFrontendRequiredContentIdentifiers() {
        List<SurveyApiModels.QuestionSectionResponse> sections =
                SurveyApiModels.sectionsFrom(
                        LocalSurveyFixture.publishedContent());

        JsonNode content = new ObjectMapper().valueToTree(sections);
        JsonNode section = content.get(0);
        JsonNode question = section.path("questions").get(0);
        JsonNode option = content.get(1)
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
        assertThat(option.has("optionLocalKey")).isFalse();
        assertThat(option.has("kind")).isFalse();
        assertThat(option.has("displayOrder")).isFalse();
        assertThat(question.has("sourceNumber")).isFalse();
        assertThat(question.has("description")).isFalse();
        assertThat(question.has("rule")).isFalse();
        assertThat(section.has("description")).isFalse();
        assertThat(section.has("displayOrder")).isFalse();
    }

    @Test
    void answerReadModelUsesTypeSpecificFieldsAndOnlyOptionId() {
        UUID questionId = UUID.randomUUID();
        UUID optionId = UUID.randomUUID();
        SurveyApiModels.AnswerResponse response =
                SurveyApiModels.AnswerResponse.from(new SingleChoiceAnswer(
                        new SurveyQuestionId(questionId),
                        new OptionSelection(
                                new SurveyOptionId(optionId), null)));

        JsonNode answer = new ObjectMapper().valueToTree(response);

        assertThat(answer.path("type").asText())
                .isEqualTo("SINGLE_CHOICE");
        assertThat(answer.path("selection").path("optionId").asText())
                .isEqualTo(optionId.toString());
        assertThat(answer.path("selection").size()).isOne();
        assertThat(answer.path("selection").has("inputText")).isFalse();
        assertThat(answer.has("text")).isFalse();
        assertThat(answer.has("number")).isFalse();
        assertThat(answer.has("scale")).isFalse();
        assertThat(answer.has("selections")).isFalse();
        assertThat(answer.has("itemAnswers")).isFalse();
    }

    @Test
    void selectionInputCreatesSelectionWithoutAdditionalText() {
        UUID optionId = UUID.randomUUID();

        OptionSelection selection =
                new SurveyApiModels.SelectionRequest(optionId).toDomain();

        assertThat(selection.optionId().value()).isEqualTo(optionId);
        assertThat(selection.optionalInputText()).isEmpty();
    }

    @Test
    void responseDetailUsesPublicMetadataSectionsAndTypedAnswers() {
        var content = LocalSurveyFixture.publishedContent();
        UUID responseId = UUID.randomUUID();
        UUID roundId = UUID.randomUUID();
        UUID questionId = UUID.randomUUID();
        UUID optionId = UUID.randomUUID();
        SurveyResponse response = mock(SurveyResponse.class);
        when(response.id()).thenReturn(new SurveyResponseId(responseId));
        when(response.roundId()).thenReturn(new SurveyRoundId(roundId));
        when(response.contentVersionId()).thenReturn(
                new SurveyContentVersionId(content.id().value()));
        when(response.submittedAt()).thenReturn(
                Instant.parse("2026-09-01T00:00:00Z"));
        when(response.answers()).thenReturn(List.of(new SingleChoiceAnswer(
                new SurveyQuestionId(questionId),
                new OptionSelection(new SurveyOptionId(optionId), null))));

        JsonNode detail = new ObjectMapper().valueToTree(
                SurveyApiModels.ResponseDetail.from(response, content));

        assertThat(detail.path("responseId").asText())
                .isEqualTo(responseId.toString());
        assertThat(detail.path("roundId").asText())
                .isEqualTo(roundId.toString());
        assertThat(detail.path("sections").size())
                .isEqualTo(RoundOneSurveyFixture.SECTION_COUNT);
        assertThat(detail.path("answers").get(0)
                .path("selection").path("optionId").asText())
                .isEqualTo(optionId.toString());
        assertThat(detail.has("id")).isFalse();
        assertThat(detail.has("roundNumber")).isFalse();
        assertThat(detail.has("content")).isFalse();
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
