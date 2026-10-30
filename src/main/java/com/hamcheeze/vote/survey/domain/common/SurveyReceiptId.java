package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

public record SurveyReceiptId(UUID value) implements SurveyId {

    public SurveyReceiptId {
        value = SurveyIdSupport.require(
                value,
                "SURVEY_RECEIPT_ID_REQUIRED",
                "receiptId");
    }
}
