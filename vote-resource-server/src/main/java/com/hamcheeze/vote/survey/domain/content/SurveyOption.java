package com.hamcheeze.vote.survey.domain.content;

import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;

import java.util.Objects;

public record SurveyOption(
        SurveyOptionId id,
        SurveyOptionLineageKey lineageKey,
        String localKey,
        SurveyOptionKind kind,
        String label,
        int displayOrder
) {

    public static final String OTHER_LABEL = "기타";

    public SurveyOption {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(lineageKey, "lineageKey");
        localKey = SurveyContentText.required(
                localKey,
                20,
                "SURVEY_OPTION_LOCAL_KEY_REQUIRED",
                "SURVEY_OPTION_LOCAL_KEY_TOO_LONG",
                "option.localKey");
        if (!localKey.matches("[A-Z]+")) {
            throw SurveyDomainException.invariant(
                    "SURVEY_OPTION_LOCAL_KEY_INVALID",
                    "option.localKey",
                    "option localKey must contain uppercase letters only");
        }
        Objects.requireNonNull(kind, "kind");
        label = SurveyContentText.required(
                label,
                SurveyContentLimits.MAX_OPTION_LABEL_LENGTH,
                "SURVEY_OPTION_LABEL_REQUIRED",
                "SURVEY_OPTION_LABEL_TOO_LONG",
                "option.label");
        if (displayOrder < 1) {
            throw SurveyDomainException.invariant(
                    "SURVEY_OPTION_DISPLAY_ORDER_INVALID",
                    "option.displayOrder",
                    "option displayOrder must be positive");
        }
        if (kind == SurveyOptionKind.OTHER && !OTHER_LABEL.equals(label)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_OTHER_OPTION_LABEL_INVALID",
                    "option.label",
                    "OTHER option label must be " + OTHER_LABEL);
        }
    }

    public SurveyOption(
            SurveyOptionId id,
            SurveyOptionLineageKey lineageKey,
            SurveyOptionKind kind,
            String label,
            int displayOrder
    ) {
        this(
                id,
                lineageKey,
                localKeyForDisplayOrder(displayOrder),
                kind,
                label,
                displayOrder);
    }

    public static SurveyOption standard(
            SurveyOptionId id,
            SurveyOptionLineageKey lineageKey,
            String label,
            int displayOrder
    ) {
        return new SurveyOption(
                id,
                lineageKey,
                localKeyForDisplayOrder(displayOrder),
                SurveyOptionKind.STANDARD,
                label,
                displayOrder);
    }

    public static SurveyOption standard(
            SurveyOptionId id,
            SurveyOptionLineageKey lineageKey,
            String localKey,
            String label,
            int displayOrder
    ) {
        return new SurveyOption(
                id,
                lineageKey,
                localKey,
                SurveyOptionKind.STANDARD,
                label,
                displayOrder);
    }

    public static SurveyOption other(
            SurveyOptionId id,
            SurveyOptionLineageKey lineageKey,
            int displayOrder
    ) {
        return new SurveyOption(
                id,
                lineageKey,
                localKeyForDisplayOrder(displayOrder),
                SurveyOptionKind.OTHER,
                OTHER_LABEL,
                displayOrder);
    }

    SurveyOption copyWithId(SurveyOptionId newId) {
        return new SurveyOption(
                newId,
                lineageKey,
                localKey,
                kind,
                label,
                displayOrder);
    }

    public static String localKeyForDisplayOrder(int displayOrder) {
        if (displayOrder < 1) {
            throw SurveyDomainException.invariant(
                    "SURVEY_OPTION_DISPLAY_ORDER_INVALID",
                    "option.displayOrder",
                    "option displayOrder must be positive");
        }
        int remaining = displayOrder;
        StringBuilder key = new StringBuilder();
        while (remaining > 0) {
            remaining--;
            key.append((char) ('A' + remaining % 26));
            remaining /= 26;
        }
        return key.reverse().toString();
    }
}
