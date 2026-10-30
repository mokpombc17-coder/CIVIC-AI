package com.hamcheeze.vote.survey.application.bootstrap;

import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;
import com.hamcheeze.vote.survey.domain.content.SurveyOptionKind;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.MatrixScaleRule;
import com.hamcheeze.vote.survey.domain.content.ScaleRule;
import com.hamcheeze.vote.survey.domain.response.MultipleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixScaleItemAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixSingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixSingleChoiceItemAnswer;
import com.hamcheeze.vote.survey.domain.response.NumberAnswer;
import com.hamcheeze.vote.survey.domain.response.OptionSelection;
import com.hamcheeze.vote.survey.domain.response.ScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import com.hamcheeze.vote.survey.domain.response.SingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveySubmissionPolicy;
import com.hamcheeze.vote.survey.domain.response.SurveySubmissionResult;
import com.hamcheeze.vote.survey.domain.common.ConsentReceiptId;
import com.hamcheeze.vote.survey.SurveyConsentTestFixture;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class LocalSurveyFixtureTest {

    @Test
    void definesCanonicalRoundOneQuestionnaireWithFixedIds() {
        List<SurveyQuestion> first = LocalSurveyFixture.questions();
        List<SurveyQuestion> second = LocalSurveyFixture.questions();

        assertThat(first).hasSize(RoundOneSurveyFixture.QUESTION_COUNT);
        assertThat(first.stream()
                .map(SurveyQuestion::section)
                .distinct())
                .hasSize(RoundOneSurveyFixture.SECTION_COUNT)
                .extracting(section -> section.title())
                .containsExactly(
                        "일반 개인정보",
                        "가구 정보",
                        "생활 · 경제",
                        "가치 · 정치 성향",
                        "미디어 · 의견 성향",
                        "사회 · 기관 신뢰",
                        "매체 이용 · 정보 습관");
        assertThat(first)
                .filteredOn(question -> !RoundOneSurveyFixture
                        .OPTIONAL_QUESTION_KEYS.contains(question.questionKey()))
                .allMatch(SurveyQuestion::required);
        assertThat(first)
                .extracting(SurveyQuestion::displayOrder)
                .containsExactlyElementsOf(
                        java.util.stream.IntStream.rangeClosed(
                                        1,
                                        RoundOneSurveyFixture.QUESTION_COUNT)
                                .boxed()
                                .toList());
        assertThat(first)
                .extracting(SurveyQuestion::type)
                .contains(
                        SurveyQuestionType.SINGLE_CHOICE,
                        SurveyQuestionType.MULTIPLE_CHOICE,
                        SurveyQuestionType.SHORT_TEXT,
                        SurveyQuestionType.NUMBER,
                        SurveyQuestionType.MATRIX_SINGLE_CHOICE,
                        SurveyQuestionType.MATRIX_SCALE);
        assertThat(first.stream()
                .filter(question -> question.type().isMatrix()))
                .hasSize(RoundOneSurveyFixture.MATRIX_QUESTION_COUNT);
        assertThat(first.stream()
                .flatMap(question -> question.items().stream()))
                .hasSize(RoundOneSurveyFixture.ITEM_COUNT)
                .allSatisfy(item -> assertThat(item.itemLabel()).isNotBlank());
        assertThat(first.stream()
                .filter(question -> question.description() != null))
                .hasSize(26);
        assertThat(first.stream()
                .filter(question -> question.questionKey().equals(
                        "demographics.residence"))
                .findFirst()
                .orElseThrow()
                .description())
                .contains("(주소지 설문은 읍/면까지 포함)");
        assertThat(first.stream()
                .filter(question -> question.questionKey().equals(
                        "social.affective-distance"))
                .findFirst()
                .orElseThrow()
                .description())
                .contains("(0점 = 전혀 호감이 가지 않는다 ~ "
                        + "10점 = 매우 호감이 간다)\n"
                        + "[각 항목별 1개 선택]");
        assertThat(first.stream()
                .flatMap(question -> question.options().stream())
                .filter(option -> option.kind() == SurveyOptionKind.OTHER))
                .isEmpty();
        assertThat(first.stream()
                .flatMap(question -> question.options().stream())
                .map(option -> option.label()))
                .contains(
                        "연간 1천만원 이상 ~ 3천만원 미만",
                        "연간 3천만원 이상 ~ 5천만원 미만",
                        "연간 5천만원 이상 ~ 7천만원 미만",
                        "연간 7천만원 이상 ~ 1억원 미만",
                        "주 5 ~ 6회",
                        "주 3 ~ 4회",
                        "주 1 ~ 2회",
                        "월 2 ~ 3회",
                        "시청 안 함",
                        "1시간 이상 ~ 3시간 미만",
                        "천주교(가톨릭)")
                .doesNotContain(
                        "연간 1천만원 이상~3천만원 미만",
                        "연간 3천만원 이상~5천만원 미만",
                        "연간 5천만원 이상~7천만원 미만",
                        "연간 7천만원 이상~1억원 미만",
                        "주 5~6회",
                        "주 3~4회",
                        "주 1~2회",
                        "월 2~3회",
                        "시청안함",
                        "1시간 이상~3시간 미만",
                        "천주교(카톨릭)");
        assertThat(first).allSatisfy(question ->
                assertThat(question.options())
                        .allSatisfy(option -> assertThat(option.localKey())
                                .isEqualTo(com.hamcheeze.vote.survey.domain
                                        .content.SurveyOption
                                        .localKeyForDisplayOrder(
                                                option.displayOrder()))));
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
        assertThat(published.name()).contains("1회차");
        assertThat(published.description()).hasValueSatisfying(
                description -> assertThat(description)
                        .contains("29개 Question"));
        assertThat(published.questionSections())
                .hasSize(RoundOneSurveyFixture.SECTION_COUNT);
    }

    @Test
    void marksSensitiveQuestionsAsOptional() {
        assertThat(LocalSurveyFixture.publishedContent().questions().stream()
                .filter(question -> !question.required())
                .map(SurveyQuestion::questionKey))
                .containsExactlyInAnyOrder(
                        "wellbeing.health-status",
                        "demographics.religion",
                        "politics.ideology",
                        "politics.supported-party");
    }

    @Test
    void acceptsOneCompleteTwentyNineAnswerSubmission() {
        var content = LocalSurveyFixture.publishedContent();
        List<SurveyAnswer> answers = content.questions().stream()
                .map(LocalSurveyFixtureTest::validAnswer)
                .toList();

        var result = submit(
                content, answers, SurveyConsentTestFixture.externalReceipt());

        assertThat(result.response().answers())
                .hasSize(RoundOneSurveyFixture.QUESTION_COUNT);
    }

    @Test
    void acceptsSubmissionWithoutOptionalAnswersAndConsentReceipt() {
        var content = LocalSurveyFixture.publishedContent();
        List<SurveyAnswer> answers = content.questions().stream()
                .filter(SurveyQuestion::required)
                .map(LocalSurveyFixtureTest::validAnswer)
                .toList();

        var result = submit(content, answers, null);

        assertThat(result.response().answers())
                .hasSize(RoundOneSurveyFixture.QUESTION_COUNT
                        - RoundOneSurveyFixture.OPTIONAL_QUESTION_KEYS.size());
        assertThat(result.response().consentReceiptId()).isEmpty();
    }

    private static SurveySubmissionResult submit(
            SurveyContentVersion content,
            List<SurveyAnswer> answers,
            ConsentReceiptId consentReceiptId
    ) {
        SurveyRound round = SurveyRound.rehydrate(
                LocalSurveyFixture.ROUND_ID,
                LocalSurveyFixture.ROUND_NUMBER,
                LocalSurveyFixture.CONTENT_VERSION_ID,
                SurveyRoundStatus.ACTIVE,
                SurveyRoundEnforcementMode.REQUIRED,
                null,
                LocalSurveyFixture.CREATED_AT,
                null,
                null,
                null,
                LocalSurveyFixture.ACTOR,
                LocalSurveyFixture.CREATED_AT,
                0);

        return new SurveySubmissionPolicy().submitFinalResponse(
                new SurveyResponseId(UUID.randomUUID()),
                new SurveyUserId("user-a"),
                LocalSurveyFixture.ROUND_ID,
                round,
                content,
                false,
                answers,
                consentReceiptId,
                LocalSurveyFixture.CREATED_AT.plusSeconds(1));
    }

    private static SurveyAnswer validAnswer(SurveyQuestion question) {
        return switch (question.type()) {
            case SINGLE_CHOICE -> new SingleChoiceAnswer(
                    question.id(),
                    new OptionSelection(
                            question.options().getFirst().id(), null));
            case MULTIPLE_CHOICE -> {
                int minimum = ((MultipleChoiceRule) question.rule())
                        .minimumSelections();
                yield new MultipleChoiceAnswer(
                        question.id(),
                        question.options().stream()
                                .limit(minimum)
                                .map(option -> new OptionSelection(
                                        option.id(), null))
                                .toList());
            }
            case SHORT_TEXT -> new ShortTextAnswer(
                    question.id(), "서울특별시 종로구 청운효자동");
            case NUMBER -> new NumberAnswer(
                    question.id(), BigDecimal.valueOf(1990));
            case SCALE -> new ScaleAnswer(
                    question.id(),
                    ((ScaleRule) question.rule()).minimum());
            case LONG_TEXT -> throw new IllegalStateException(
                    "round one fixture must not contain LONG_TEXT");
            case MATRIX_SINGLE_CHOICE -> new MatrixSingleChoiceAnswer(
                    question.id(),
                    question.items().stream()
                            .map(item -> new MatrixSingleChoiceItemAnswer(
                                    item.id(),
                                    new OptionSelection(
                                            question.options().getFirst().id(),
                                            null)))
                            .toList());
            case MATRIX_SCALE -> new MatrixScaleAnswer(
                    question.id(),
                    question.items().stream()
                            .map(item -> new MatrixScaleItemAnswer(
                                    item.id(),
                                    ((MatrixScaleRule) question.rule())
                                            .minimum()))
                            .toList());
        };
    }
}
