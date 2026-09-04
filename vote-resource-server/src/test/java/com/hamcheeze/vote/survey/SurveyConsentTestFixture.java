package com.hamcheeze.vote.survey;

import com.hamcheeze.vote.survey.domain.common.ConsentReceiptId;

import java.util.UUID;

public final class SurveyConsentTestFixture {

    private SurveyConsentTestFixture() {
    }

    public static ConsentReceiptId externalReceipt() {
        return new ConsentReceiptId(UUID.randomUUID());
    }
}
