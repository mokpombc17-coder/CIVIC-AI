package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionItemId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionItemLineageKey;

import java.util.Objects;

public record SurveyQuestionItem(
        SurveyQuestionItemId id,
        SurveyQuestionItemLineageKey lineageKey,
        String itemKey,
        String itemLabel,
        int displayOrder
) {

    public SurveyQuestionItem {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(lineageKey, "lineageKey");
        itemKey = SurveyContentText.required(
                itemKey,
                150,
                "SURVEY_QUESTION_ITEM_KEY_REQUIRED",
                "SURVEY_QUESTION_ITEM_KEY_TOO_LONG",
                "item.itemKey");
        itemLabel = SurveyContentText.required(
                itemLabel,
                200,
                "SURVEY_QUESTION_ITEM_LABEL_REQUIRED",
                "SURVEY_QUESTION_ITEM_LABEL_TOO_LONG",
                "item.itemLabel");
        if (displayOrder < 1) {
            throw SurveyDomainException.invariant(
                    "SURVEY_QUESTION_ITEM_DISPLAY_ORDER_INVALID",
                    "item.displayOrder",
                    "item displayOrder must be positive");
        }
    }

    SurveyQuestionItem copyWithId(SurveyQuestionItemId newId) {
        return new SurveyQuestionItem(
                newId,
                lineageKey,
                itemKey,
                itemLabel,
                displayOrder);
    }
}
