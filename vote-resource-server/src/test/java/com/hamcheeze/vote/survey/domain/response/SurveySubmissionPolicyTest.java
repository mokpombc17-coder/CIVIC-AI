package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.common.SurveyValidationException;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static com.hamcheeze.vote.survey.SurveyTestFixtures.NOW;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.actorId;
import static com.hamcheeze.vote.survey.domain.response.SurveyResponseTestFixtures.CONTENT_ID;
import static com.hamcheeze.vote.survey.domain.response.SurveyResponseTestFixtures.ROUND_ID;
import static com.hamcheeze.vote.survey.domain.response.SurveyResponseTestFixtures.activeRound;
import static com.hamcheeze.vote.survey.domain.response.SurveyResponseTestFixtures.content;
import static com.hamcheeze.vote.survey.domain.response.SurveyResponseTestFixtures.optionId;
import static com.hamcheeze.vote.survey.domain.response.SurveyResponseTestFixtures.questionId;
import static com.hamcheeze.vote.survey.domain.response.SurveyResponseTestFixtures.validAnswers;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveySubmissionPolicyTest {

    private final SurveySubmissionPolicy policy =
            new SurveySubmissionPolicy();

    @Test
    void createsImmutableFinalResponseAndDomainFact() {
        SurveySubmissionResult result = submit(validAnswers());

        SurveyResponse response = result.response();
        assertThat(response.userId()).isEqualTo(new SurveyUserId("user-a"));
        assertThat(response.roundId()).isEqualTo(ROUND_ID);
        assertThat(response.roundNumber().value()).isEqualTo(3);
        assertThat(response.contentVersionId()).isEqualTo(CONTENT_ID);
        assertThat(response.answers())
                .extracting(SurveyAnswer::questionId)
                .containsExactly(
                        questionId(1), questionId(2), questionId(3),
                        questionId(4), questionId(5), questionId(6));
        assertThatThrownBy(() -> response.answers().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThat(result.event())
                .extracting(
                        SurveyResponseSubmitted::responseId,
                        SurveyResponseSubmitted::roundId,
                        SurveyResponseSubmitted::contentVersionId,
                        SurveyResponseSubmitted::submittedAt)
                .containsExactly(
                        response.id(), ROUND_ID, CONTENT_ID,
                        NOW.plusSeconds(10));
    }

    @Test
    void normalizesTextOtherSelectionOrderAndNumber() {
        SurveyResponse response = submit(validAnswers()).response();

        MultipleChoiceAnswer multiple =
                (MultipleChoiceAnswer) response.answers().get(1);
        assertThat(multiple.selections())
                .extracting(OptionSelection::optionId)
                .containsExactly(optionId(3), optionId(5));
        assertThat(multiple.selections().getLast().inputText())
                .isEqualTo("도시 계획");
        assertThat(((ShortTextAnswer) response.answers().get(2)).value())
                .isEqualTo("관심사");
        assertThat(((LongTextAnswer) response.answers().get(3)).value())
                .isEqualTo("첫 줄\n둘째 줄");
        assertThat(((NumberAnswer) response.answers().get(4)).value())
                .isEqualByComparingTo(new BigDecimal("10"));
        assertThat(((NumberAnswer) response.answers().get(4)).value().scale())
                .isZero();
    }

    @Test
    void rejectsContextErrorsBeforeInspectingAnswers() {
        SurveyRound closedRound = SurveyRound.rehydrate(
                ROUND_ID,
                activeRound().roundNumber(),
                CONTENT_ID,
                SurveyRoundStatus.CLOSED,
                SurveyRoundEnforcementMode.REQUIRED,
                null,
                NOW.plusSeconds(2),
                NOW.plusSeconds(5),
                null,
                new SurveyRoundId(new UUID(80, 2)),
                actorId(),
                NOW,
                0);

        assertThatThrownBy(() -> policy.submitFinalResponse(
                responseId(),
                new SurveyUserId("user-a"),
                ROUND_ID,
                closedRound,
                content(),
                false,
                List.of(),
                NOW.plusSeconds(10)))
                .isInstanceOfSatisfying(
                        SurveyDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "SURVEY_SUBMISSION_ACTIVE_ROUND_REQUIRED"));

        assertThatThrownBy(() -> policy.submitFinalResponse(
                responseId(),
                new SurveyUserId("user-a"),
                ROUND_ID,
                activeRound(),
                content(),
                true,
                List.of(),
                NOW.plusSeconds(10)))
                .isInstanceOfSatisfying(
                        SurveyDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "SURVEY_RESPONSE_ALREADY_SUBMITTED"));
    }

    @Test
    void rejectsRoundAndContentVersionMismatch() {
        assertThatThrownBy(() -> policy.submitFinalResponse(
                responseId(),
                new SurveyUserId("user-a"),
                new SurveyRoundId(new UUID(90, 1)),
                activeRound(),
                content(),
                false,
                validAnswers(),
                NOW.plusSeconds(10)))
                .isInstanceOfSatisfying(
                        SurveyDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo("SURVEY_SUBMISSION_ROUND_CHANGED"));

        SurveyContentVersion differentContent = singleTextContent();
        assertThatThrownBy(() -> policy.submitFinalResponse(
                responseId(),
                new SurveyUserId("user-a"),
                ROUND_ID,
                activeRound(),
                differentContent,
                false,
                List.of(),
                NOW.plusSeconds(10)))
                .isInstanceOfSatisfying(
                        SurveyDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo(
                                        "SURVEY_SUBMISSION_CONTENT_VERSION_MISMATCH"));
    }

    @Test
    void collectsMissingUnknownDuplicateAndTypeViolations() {
        SurveyQuestionId unknownQuestionId =
                new SurveyQuestionId(new UUID(99, 1));
        List<SurveyAnswer> invalid = List.of(
                new ShortTextAnswer(questionId(1), "잘못된 타입"),
                new ShortTextAnswer(questionId(1), "중복"),
                new ShortTextAnswer(unknownQuestionId, "알 수 없음"));

        assertThatThrownBy(() -> submit(invalid))
                .isInstanceOfSatisfying(
                        SurveyValidationException.class,
                        exception -> assertThat(exception.violations())
                                .extracting(violation -> violation.code())
                                .contains(
                                        "SURVEY_ANSWER_QUESTION_DUPLICATED",
                                        "SURVEY_ANSWER_QUESTION_UNKNOWN",
                                        "SURVEY_REQUIRED_ANSWER_MISSING"));
    }

    @Test
    void collectsSelectionAndOtherInputViolations() {
        List<SurveyAnswer> invalid = new ArrayList<>(validAnswers());
        invalid.set(4, new MultipleChoiceAnswer(
                questionId(2),
                List.of(
                        new OptionSelection(optionId(3), "금지된 입력"),
                        new OptionSelection(optionId(3), null),
                        new OptionSelection(optionId(5), "   "))));

        assertThatThrownBy(() -> submit(invalid))
                .isInstanceOfSatisfying(
                        SurveyValidationException.class,
                        exception -> assertThat(exception.violations())
                                .extracting(violation -> violation.code())
                                .contains(
                                        "SURVEY_OPTION_SELECTION_DUPLICATED",
                                        "SURVEY_STANDARD_OPTION_INPUT_NOT_ALLOWED",
                                        "SURVEY_OTHER_TEXT_REQUIRED"));
    }

    @Test
    void validatesTextByCodePointAndRejectsControlCharacters() {
        List<SurveyAnswer> invalid = new ArrayList<>(validAnswers());
        invalid.set(3, new ShortTextAnswer(
                questionId(3),
                "😀".repeat(21) + "\u0000"));

        assertThatThrownBy(() -> submit(invalid))
                .isInstanceOfSatisfying(
                        SurveyValidationException.class,
                        exception -> assertThat(exception.violations())
                                .extracting(violation -> violation.code())
                                .contains(
                                        "SURVEY_TEXT_TOO_LONG",
                                        "SURVEY_TEXT_CONTROL_CHARACTER_INVALID"));
    }

    @Test
    void validatesNumberAndScaleRangesAndDecimalScale() {
        List<SurveyAnswer> invalid = new ArrayList<>(validAnswers());
        invalid.set(1, new NumberAnswer(
                questionId(5),
                new BigDecimal("100.123")));
        invalid.set(0, new ScaleAnswer(questionId(6), 6));

        assertThatThrownBy(() -> submit(invalid))
                .isInstanceOfSatisfying(
                        SurveyValidationException.class,
                        exception -> assertThat(exception.violations())
                                .extracting(violation -> violation.code())
                                .contains(
                                        "SURVEY_NUMBER_OUT_OF_RANGE",
                                        "SURVEY_NUMBER_DECIMAL_SCALE_EXCEEDED",
                                        "SURVEY_SCALE_OUT_OF_RANGE"));
    }

    @Test
    void selectsLatestResponseByRoundNumberNotSubmissionTime() {
        SurveyResponse roundTwoLate = SurveyResponse.rehydrate(
                new SurveyResponseId(new UUID(95, 2)),
                new SurveyUserId("user-a"),
                new SurveyRoundId(new UUID(96, 2)),
                new com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber(2),
                CONTENT_ID,
                NOW.plusSeconds(1_000),
                List.of());
        SurveyResponse roundThreeEarly = SurveyResponse.rehydrate(
                new SurveyResponseId(new UUID(95, 3)),
                new SurveyUserId("user-a"),
                new SurveyRoundId(new UUID(96, 3)),
                new com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber(3),
                CONTENT_ID,
                NOW.plusSeconds(100),
                List.of());

        assertThat(SurveyResponse.latestOf(
                List.of(roundTwoLate, roundThreeEarly)))
                .contains(roundThreeEarly);
        assertThat(SurveyResponse.latestOf(List.of())).isEmpty();
    }

    private SurveySubmissionResult submit(List<SurveyAnswer> answers) {
        return policy.submitFinalResponse(
                responseId(),
                new SurveyUserId("user-a"),
                ROUND_ID,
                activeRound(),
                content(),
                false,
                answers,
                NOW.plusSeconds(10));
    }

    private static SurveyResponseId responseId() {
        return new SurveyResponseId(new UUID(81, 1));
    }

    private static SurveyContentVersion singleTextContent() {
        SurveyContentVersionId id =
                new SurveyContentVersionId(new UUID(91, 1));
        SurveyQuestion question = new SurveyQuestion(
                new SurveyQuestionId(new UUID(91, 2)),
                new com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey(
                        new UUID(91, 3)),
                SurveyQuestionType.SHORT_TEXT,
                "질문",
                null,
                1,
                true,
                ShortTextRule.defaults(),
                List.of());
        return SurveyContentVersion.createDraft(
                        id,
                        "다른 내용",
                        null,
                        List.of(question),
                        actorId(),
                        NOW)
                .publish(
                        new SurveyContentVersionNumber(2),
                        actorId(),
                        NOW.plusSeconds(1))
                .contentVersion();
    }

}
