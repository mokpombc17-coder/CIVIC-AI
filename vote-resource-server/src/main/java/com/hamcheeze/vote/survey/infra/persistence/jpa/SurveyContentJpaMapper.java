package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.content.LongTextRule;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.NumberRule;
import com.hamcheeze.vote.survey.domain.content.QuestionRule;
import com.hamcheeze.vote.survey.domain.content.ScaleRule;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SingleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;

import java.util.List;
import java.util.Map;

final class SurveyContentJpaMapper {

    private SurveyContentJpaMapper() {
    }

    static SurveyContentVersion toDomain(
            SurveyContentVersionJpaEntity content,
            List<SurveyQuestionJpaEntity> questions,
            Map<java.util.UUID, List<SurveyOptionJpaEntity>> optionsByQuestion
    ) {
        List<SurveyQuestion> domainQuestions = questions.stream()
                .map(question -> new SurveyQuestion(
                        new SurveyQuestionId(question.id()),
                        new SurveyQuestionLineageKey(question.lineageId()),
                        question.type(),
                        question.prompt(),
                        question.description(),
                        question.displayOrder(),
                        question.required(),
                        toRule(question),
                        optionsByQuestion
                                .getOrDefault(question.id(), List.of())
                                .stream()
                                .map(SurveyContentJpaMapper::toDomain)
                                .toList()))
                .toList();
        return SurveyContentVersion.rehydrate(
                new SurveyContentVersionId(content.id()),
                content.versionNumber() == null
                        ? null
                        : new SurveyContentVersionNumber(
                                Math.toIntExact(content.versionNumber())),
                content.status(),
                content.rowVersion(),
                content.name(),
                content.description(),
                domainQuestions,
                content.derivedFromContentVersionId() == null
                        ? null
                        : new SurveyContentVersionId(
                                content.derivedFromContentVersionId()),
                new SurveyActorId(content.createdBy()),
                content.createdAt(),
                new SurveyActorId(content.lastModifiedBy()),
                content.lastModifiedAt(),
                content.publishedBy() == null
                        ? null
                        : new SurveyActorId(content.publishedBy()),
                content.publishedAt());
    }

    static void copyRuleToEntity(
            QuestionRule rule,
            SurveyQuestionJpaEntity entity
    ) {
        switch (rule) {
            case SingleChoiceRule ignored -> {
            }
            case MultipleChoiceRule multiple -> {
                entity.minimumSelections(multiple.minimumSelections());
                entity.maximumSelections(multiple.maximumSelections());
            }
            case ShortTextRule text -> entity.textMaxLength(text.maxLength());
            case LongTextRule text -> entity.textMaxLength(text.maxLength());
            case NumberRule number -> {
                entity.numberMinimum(number.minimum());
                entity.numberMaximum(number.maximum());
                entity.decimalAllowed(number.decimalAllowed());
                entity.decimalScale(number.decimalScale());
            }
            case ScaleRule scale -> {
                entity.scaleMinimum(scale.minimum());
                entity.scaleMaximum(scale.maximum());
                entity.scaleMinimumLabel(scale.minimumLabel());
                entity.scaleMaximumLabel(scale.maximumLabel());
            }
        }
    }

    private static QuestionRule toRule(SurveyQuestionJpaEntity question) {
        return switch (question.type()) {
            case SINGLE_CHOICE -> new SingleChoiceRule();
            case MULTIPLE_CHOICE -> new MultipleChoiceRule(
                    question.minimumSelections(),
                    question.maximumSelections());
            case SHORT_TEXT -> new ShortTextRule(question.textMaxLength());
            case LONG_TEXT -> new LongTextRule(question.textMaxLength());
            case NUMBER -> new NumberRule(
                    question.numberMinimum(),
                    question.numberMaximum(),
                    question.decimalAllowed(),
                    question.decimalScale());
            case SCALE -> new ScaleRule(
                    question.scaleMinimum(),
                    question.scaleMaximum(),
                    question.scaleMinimumLabel(),
                    question.scaleMaximumLabel());
        };
    }

    private static SurveyOption toDomain(SurveyOptionJpaEntity option) {
        return new SurveyOption(
                new SurveyOptionId(option.id()),
                new SurveyOptionLineageKey(option.lineageId()),
                option.kind(),
                option.label(),
                option.displayOrder());
    }
}
