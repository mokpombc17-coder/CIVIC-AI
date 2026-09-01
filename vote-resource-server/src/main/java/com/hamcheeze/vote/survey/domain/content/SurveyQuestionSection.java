package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionSectionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionSectionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;

import java.util.Objects;

public record SurveyQuestionSection(
        SurveyQuestionSectionId id,
        SurveyQuestionSectionLineageKey lineageKey,
        String sectionKey,
        String title,
        String description,
        int displayOrder
) {

    public SurveyQuestionSection {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(lineageKey, "lineageKey");
        sectionKey = SurveyContentText.required(
                sectionKey,
                150,
                "SURVEY_QUESTION_SECTION_KEY_REQUIRED",
                "SURVEY_QUESTION_SECTION_KEY_TOO_LONG",
                "section.sectionKey");
        title = SurveyContentText.required(
                title,
                200,
                "SURVEY_QUESTION_SECTION_TITLE_REQUIRED",
                "SURVEY_QUESTION_SECTION_TITLE_TOO_LONG",
                "section.title");
        description = SurveyContentText.optional(
                description,
                1_000,
                "SURVEY_QUESTION_SECTION_DESCRIPTION_TOO_LONG",
                "section.description");
        if (displayOrder < 1) {
            throw SurveyDomainException.invariant(
                    "SURVEY_QUESTION_SECTION_DISPLAY_ORDER_INVALID",
                    "section.displayOrder",
                    "section displayOrder must be positive");
        }
    }

    public static SurveyQuestionSection legacySingleton(
            SurveyQuestionId questionId,
            SurveyQuestionLineageKey questionLineageKey,
            String questionTitle,
            int questionDisplayOrder
    ) {
        return new SurveyQuestionSection(
                new SurveyQuestionSectionId(questionId.value()),
                new SurveyQuestionSectionLineageKey(
                        questionLineageKey.value()),
                "legacy." + questionId.value(),
                questionTitle,
                null,
                questionDisplayOrder);
    }

    public SurveyQuestionSection copyWithId(
            SurveyQuestionSectionId newId
    ) {
        return new SurveyQuestionSection(
                newId,
                lineageKey,
                sectionKey,
                title,
                description,
                displayOrder);
    }
}
