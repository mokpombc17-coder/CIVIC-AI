package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionGroupId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionGroupLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;

import java.util.Objects;
import java.util.UUID;

public record SurveyQuestionGroup(
        SurveyQuestionGroupId id,
        SurveyQuestionGroupLineageKey lineageKey,
        SurveyQuestionSection section,
        String groupKey,
        String sourceNumber,
        String title,
        String prompt,
        String description,
        int displayOrder
) {

    public SurveyQuestionGroup {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(lineageKey, "lineageKey");
        Objects.requireNonNull(section, "section");
        groupKey = SurveyContentText.required(
                groupKey,
                150,
                "SURVEY_QUESTION_GROUP_KEY_REQUIRED",
                "SURVEY_QUESTION_GROUP_KEY_TOO_LONG",
                "group.groupKey");
        sourceNumber = SurveyContentText.required(
                sourceNumber,
                20,
                "SURVEY_QUESTION_GROUP_SOURCE_NUMBER_REQUIRED",
                "SURVEY_QUESTION_GROUP_SOURCE_NUMBER_TOO_LONG",
                "group.sourceNumber");
        title = SurveyContentText.required(
                title,
                200,
                "SURVEY_QUESTION_GROUP_TITLE_REQUIRED",
                "SURVEY_QUESTION_GROUP_TITLE_TOO_LONG",
                "group.title");
        prompt = SurveyContentText.required(
                prompt,
                1_000,
                "SURVEY_QUESTION_GROUP_PROMPT_REQUIRED",
                "SURVEY_QUESTION_GROUP_PROMPT_TOO_LONG",
                "group.prompt");
        description = SurveyContentText.optional(
                description,
                1_000,
                "SURVEY_QUESTION_GROUP_DESCRIPTION_TOO_LONG",
                "group.description");
        if (displayOrder < 1) {
            throw SurveyDomainException.invariant(
                    "SURVEY_QUESTION_GROUP_DISPLAY_ORDER_INVALID",
                    "group.displayOrder",
                    "group displayOrder must be positive");
        }
    }

    public SurveyQuestionGroup(
            SurveyQuestionGroupId id,
            SurveyQuestionGroupLineageKey lineageKey,
            String groupKey,
            String sourceNumber,
            String title,
            String prompt,
            String description,
            int displayOrder
    ) {
        this(
                id,
                lineageKey,
                SurveyQuestionSection.legacySingleton(
                        id, lineageKey, title, displayOrder),
                groupKey,
                sourceNumber,
                title,
                prompt,
                description,
                displayOrder);
    }

    public static SurveyQuestionGroup legacySingleton(
            SurveyQuestionId questionId,
            SurveyQuestionLineageKey questionLineageKey,
            String questionPrompt,
            int questionDisplayOrder
    ) {
        UUID groupId = questionId.value();
        UUID lineageId = questionLineageKey.value();
        return new SurveyQuestionGroup(
                new SurveyQuestionGroupId(groupId),
                new SurveyQuestionGroupLineageKey(lineageId),
                "legacy." + groupId,
                Integer.toString(questionDisplayOrder),
                truncate(questionPrompt, 200),
                questionPrompt,
                null,
                questionDisplayOrder);
    }

    public SurveyQuestionGroup copyWithId(SurveyQuestionGroupId newId) {
        return copyWithIds(newId, section);
    }

    public SurveyQuestionGroup copyWithIds(
            SurveyQuestionGroupId newId,
            SurveyQuestionSection newSection
    ) {
        return new SurveyQuestionGroup(
                newId,
                lineageKey,
                newSection,
                groupKey,
                sourceNumber,
                title,
                prompt,
                description,
                displayOrder);
    }

    private static String truncate(String value, int maximumCodePoints) {
        Objects.requireNonNull(value, "value");
        int count = value.codePointCount(0, value.length());
        if (count <= maximumCodePoints) {
            return value;
        }
        return value.substring(
                0,
                value.offsetByCodePoints(0, maximumCodePoints));
    }
}
