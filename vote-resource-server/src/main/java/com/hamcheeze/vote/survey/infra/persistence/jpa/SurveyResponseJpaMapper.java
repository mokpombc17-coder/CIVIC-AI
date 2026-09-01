package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionItemId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.response.LongTextAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixScaleItemAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixSingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.MatrixSingleChoiceItemAnswer;
import com.hamcheeze.vote.survey.domain.response.MultipleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.NumberAnswer;
import com.hamcheeze.vote.survey.domain.response.OptionSelection;
import com.hamcheeze.vote.survey.domain.response.ScaleAnswer;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import com.hamcheeze.vote.survey.domain.response.SingleChoiceAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyAnswer;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class SurveyResponseJpaMapper {

    private SurveyResponseJpaMapper() {
    }

    static SurveyResponse toDomain(
            SurveyResponseJpaEntity response,
            List<SurveyAnswerJpaEntity> answers,
            Map<UUID, List<SurveyAnswerSelectionJpaEntity>> selectionsByAnswer,
            Map<UUID, List<SurveyAnswerItemValueJpaEntity>> itemValuesByAnswer
    ) {
        List<SurveyAnswer> domainAnswers = answers.stream()
                .map(answer -> toDomain(
                        answer,
                        selectionsByAnswer.getOrDefault(
                                answer.id(), List.of()),
                        itemValuesByAnswer.getOrDefault(
                                answer.id(), List.of())))
                .toList();
        return SurveyResponse.rehydrate(
                new SurveyResponseId(response.id()),
                new SurveyUserId(response.userId()),
                new SurveyRoundId(response.roundId()),
                new SurveyRoundNumber(Math.toIntExact(
                        response.round().roundNumber())),
                new SurveyContentVersionId(response.contentVersionId()),
                response.submittedAt(),
                domainAnswers);
    }

    private static SurveyAnswer toDomain(
            SurveyAnswerJpaEntity answer,
            List<SurveyAnswerSelectionJpaEntity> selections,
            List<SurveyAnswerItemValueJpaEntity> itemValues
    ) {
        SurveyQuestionId questionId = new SurveyQuestionId(
                answer.questionId());
        return switch (answer.answerType()) {
            case SINGLE_CHOICE -> new SingleChoiceAnswer(
                    questionId,
                    oneSelection(answer, selections));
            case MULTIPLE_CHOICE -> new MultipleChoiceAnswer(
                    questionId,
                    selections.stream()
                            .map(SurveyResponseJpaMapper::toDomain)
                            .toList());
            case SHORT_TEXT -> new ShortTextAnswer(
                    questionId,
                    answer.textValue());
            case LONG_TEXT -> new LongTextAnswer(
                    questionId,
                    answer.textValue());
            case NUMBER -> new NumberAnswer(
                    questionId,
                    canonical(answer.numberValue()));
            case SCALE -> new ScaleAnswer(
                    questionId,
                    answer.scaleValue());
            case MATRIX_SINGLE_CHOICE -> new MatrixSingleChoiceAnswer(
                    questionId,
                    itemValues.stream()
                            .map(value -> new MatrixSingleChoiceItemAnswer(
                                    new SurveyQuestionItemId(value.itemId()),
                                    new OptionSelection(
                                            new SurveyOptionId(
                                                    value.optionId()),
                                            value.inputText())))
                            .toList());
            case MATRIX_SCALE -> new MatrixScaleAnswer(
                    questionId,
                    itemValues.stream()
                            .map(value -> new MatrixScaleItemAnswer(
                                    new SurveyQuestionItemId(value.itemId()),
                                    value.scaleValue()))
                            .toList());
        };
    }

    private static OptionSelection oneSelection(
            SurveyAnswerJpaEntity answer,
            List<SurveyAnswerSelectionJpaEntity> selections
    ) {
        if (selections.size() != 1) {
            throw new IllegalStateException(
                    "single choice answer must have one selection: "
                            + answer.id());
        }
        return toDomain(selections.getFirst());
    }

    private static OptionSelection toDomain(
            SurveyAnswerSelectionJpaEntity selection
    ) {
        return new OptionSelection(
                new SurveyOptionId(selection.optionId()),
                selection.inputText());
    }

    private static BigDecimal canonical(BigDecimal value) {
        BigDecimal normalized = value.stripTrailingZeros();
        return normalized.scale() < 0 ? normalized.setScale(0) : normalized;
    }
}
