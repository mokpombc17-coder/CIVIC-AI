package com.hamcheeze.vote.survey.application.idempotency;

import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.response.MultipleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.NumberAnswer;
import com.hamcheeze.vote.survey.domain.response.OptionSelection;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswer;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SurveySubmissionRequestHashFactoryTest {

    private final SurveySubmissionRequestHashFactory hashFactory =
            new SurveySubmissionRequestHashFactory();

    @Test
    void hashesSemanticallyEquivalentRequestsIdentically() {
        SurveyRoundId roundId = new SurveyRoundId(uuid(1));
        SurveyQuestionId textQuestion = new SurveyQuestionId(uuid(2));
        SurveyQuestionId choiceQuestion = new SurveyQuestionId(uuid(3));
        SurveyQuestionId numberQuestion = new SurveyQuestionId(uuid(4));
        OptionSelection first = new OptionSelection(
                new SurveyOptionId(uuid(5)), null);
        OptionSelection other = new OptionSelection(
                new SurveyOptionId(uuid(6)), "  직접\r\n입력  ");

        List<SurveyAnswer> firstRequest = List.of(
                new ShortTextAnswer(
                        textQuestion,
                        "  첫째 줄\r\n둘째 줄  "),
                new MultipleChoiceAnswer(
                        choiceQuestion,
                        List.of(other, first)),
                new NumberAnswer(
                        numberQuestion,
                        new BigDecimal("1.000")));
        List<SurveyAnswer> reorderedEquivalentRequest = List.of(
                new NumberAnswer(numberQuestion, BigDecimal.ONE),
                new MultipleChoiceAnswer(
                        choiceQuestion,
                        List.of(
                                first,
                                new OptionSelection(
                                        other.optionId(),
                                        "직접\n입력"))),
                new ShortTextAnswer(
                        textQuestion,
                        "첫째 줄\n둘째 줄"));

        assertThat(hashFactory.hash(roundId, firstRequest))
                .isEqualTo(hashFactory.hash(
                        roundId,
                        reorderedEquivalentRequest));
    }

    @Test
    void changesTheHashWhenAnAnswerChanges() {
        SurveyRoundId roundId = new SurveyRoundId(uuid(10));
        SurveyQuestionId questionId = new SurveyQuestionId(uuid(11));

        SurveyRequestHash original = hashFactory.hash(
                roundId,
                List.of(new ShortTextAnswer(questionId, "original")));
        SurveyRequestHash changed = hashFactory.hash(
                roundId,
                List.of(new ShortTextAnswer(questionId, "changed")));

        assertThat(changed).isNotEqualTo(original);
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
