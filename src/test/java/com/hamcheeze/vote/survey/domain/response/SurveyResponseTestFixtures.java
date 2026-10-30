package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.content.LongTextRule;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.NumberRule;
import com.hamcheeze.vote.survey.domain.content.ScaleRule;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SingleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static com.hamcheeze.vote.survey.SurveyTestFixtures.NOW;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.actorId;

final class SurveyResponseTestFixtures {

    static final SurveyContentVersionId CONTENT_ID =
            new SurveyContentVersionId(uuid(100));
    static final SurveyRoundId ROUND_ID = new SurveyRoundId(uuid(200));

    private SurveyResponseTestFixtures() {
    }

    static SurveyContentVersion content() {
        return content(true);
    }

    static SurveyContentVersion contentWithOptionalScale() {
        return content(false);
    }

    private static SurveyContentVersion content(boolean scaleRequired) {
        List<SurveyQuestion> questions = List.of(
                new SurveyQuestion(
                        questionId(1), lineageId(1),
                        SurveyQuestionType.SINGLE_CHOICE,
                        "단일 선택", null, 1, true,
                        new SingleChoiceRule(),
                        List.of(
                                standardOption(1, 1),
                                otherOption(2, 2))),
                new SurveyQuestion(
                        questionId(2), lineageId(2),
                        SurveyQuestionType.MULTIPLE_CHOICE,
                        "복수 선택", null, 2, true,
                        new MultipleChoiceRule(1, 3),
                        List.of(
                                standardOption(3, 1),
                                standardOption(4, 2),
                                otherOption(5, 3))),
                new SurveyQuestion(
                        questionId(3), lineageId(3),
                        SurveyQuestionType.SHORT_TEXT,
                        "짧은 글", null, 3, true,
                        new ShortTextRule(20), List.of()),
                new SurveyQuestion(
                        questionId(4), lineageId(4),
                        SurveyQuestionType.LONG_TEXT,
                        "긴 글", null, 4, true,
                        new LongTextRule(100), List.of()),
                new SurveyQuestion(
                        questionId(5), lineageId(5),
                        SurveyQuestionType.NUMBER,
                        "숫자", null, 5, true,
                        new NumberRule(
                                BigDecimal.ZERO,
                                new BigDecimal("100"),
                                true,
                                2),
                        List.of()),
                new SurveyQuestion(
                        questionId(6), lineageId(6),
                        SurveyQuestionType.SCALE,
                        "척도", null, 6, scaleRequired,
                        new ScaleRule(1, 5, null, null),
                        List.of()));
        return SurveyContentVersion.createDraft(
                        CONTENT_ID,
                        "Response test survey",
                        null,
                        questions,
                        actorId(),
                        NOW)
                .publish(
                        new SurveyContentVersionNumber(1),
                        actorId(),
                        NOW.plusSeconds(1))
                .contentVersion();
    }

    static SurveyRound activeRound() {
        return SurveyRound.rehydrate(
                ROUND_ID,
                new SurveyRoundNumber(3),
                CONTENT_ID,
                SurveyRoundStatus.ACTIVE,
                SurveyRoundEnforcementMode.REQUIRED,
                null,
                NOW.plusSeconds(2),
                null,
                null,
                null,
                actorId(),
                NOW,
                0);
    }

    static List<SurveyAnswer> validAnswers() {
        return List.of(
                new ScaleAnswer(questionId(6), 4),
                new NumberAnswer(questionId(5), new BigDecimal("10.00")),
                new LongTextAnswer(questionId(4), "  첫 줄\r\n둘째 줄  "),
                new ShortTextAnswer(questionId(3), "  관심사  "),
                new MultipleChoiceAnswer(
                        questionId(2),
                        List.of(
                                new OptionSelection(optionId(5), "  도시 계획  "),
                                new OptionSelection(optionId(3), null))),
                new SingleChoiceAnswer(
                        questionId(1),
                        new OptionSelection(optionId(1), null)));
    }

    static SurveyQuestionId questionId(int sequence) {
        return new SurveyQuestionId(new UUID(70, sequence));
    }

    static SurveyOptionId optionId(int sequence) {
        return new SurveyOptionId(new UUID(71, sequence));
    }

    private static SurveyQuestionLineageKey lineageId(int sequence) {
        return new SurveyQuestionLineageKey(new UUID(72, sequence));
    }

    private static SurveyOption standardOption(
            int sequence,
            int displayOrder
    ) {
        return SurveyOption.standard(
                optionId(sequence),
                new SurveyOptionLineageKey(new UUID(73, sequence)),
                "선택지 " + sequence,
                displayOrder);
    }

    private static SurveyOption otherOption(
            int sequence,
            int displayOrder
    ) {
        return SurveyOption.other(
                optionId(sequence),
                new SurveyOptionLineageKey(new UUID(73, sequence)),
                displayOrder);
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
