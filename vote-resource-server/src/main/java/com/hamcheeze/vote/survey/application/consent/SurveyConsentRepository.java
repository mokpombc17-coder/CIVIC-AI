package com.hamcheeze.vote.survey.application.consent;

import com.hamcheeze.vote.survey.domain.common.ConsentReceiptId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentDocument;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentReceipt;

import java.util.Optional;
import java.util.UUID;

public interface SurveyConsentRepository {

    SurveyConsentDocument saveDocument(SurveyConsentDocument document);

    Optional<SurveyConsentDocument> findDocumentByRoundId(
            SurveyRoundId roundId);

    SurveyConsentReceipt insertReceipt(SurveyConsentReceipt receipt);

    Optional<SurveyConsentReceipt> findReceiptById(
            ConsentReceiptId receiptId);

    Optional<SurveyConsentReceipt> findReceiptByUserIdAndIdempotencyKey(
            SurveyUserId userId,
            UUID idempotencyKey);
}
