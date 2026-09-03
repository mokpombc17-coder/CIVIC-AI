package com.hamcheeze.vote.survey;

import com.hamcheeze.vote.survey.application.consent.SurveyConsentService;
import com.hamcheeze.vote.survey.domain.common.ConsentReceiptId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;

import java.util.UUID;

public final class SurveyConsentTestFixture {

    private SurveyConsentTestFixture() {
    }

    public static ConsentReceiptId accept(
            SurveyConsentService consents,
            SurveyRoundId roundId,
            SurveyUserId userId
    ) {
        consents.publishDocument(
                roundId,
                "test-survey-consent",
                "test-v1",
                "Test survey consent",
                "Consent document used only by automated tests.");
        return consents.accept(
                        userId,
                        UUID.randomUUID().toString(),
                        new SurveyConsentService.AcceptConsentCommand(
                                "test-survey-consent",
                                "test-v1",
                                roundId,
                                null))
                .receipt()
                .id();
    }
}
