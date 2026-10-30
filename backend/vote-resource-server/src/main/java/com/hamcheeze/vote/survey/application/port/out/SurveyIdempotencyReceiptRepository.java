package com.hamcheeze.vote.survey.application.port.out;

import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyKey;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyOperation;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyReceipt;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;

import java.util.Optional;

public interface SurveyIdempotencyReceiptRepository {

    Optional<SurveyIdempotencyReceipt> findByRequestForUpdate(
            SurveyUserId userId,
            SurveyIdempotencyOperation operation,
            SurveyIdempotencyKey idempotencyKey);

    Optional<SurveyIdempotencyReceipt> findByRequest(
            SurveyUserId userId,
            SurveyIdempotencyOperation operation,
            SurveyIdempotencyKey idempotencyKey);

    void insertProcessing(SurveyIdempotencyReceipt receipt);

    void updateCompleted(SurveyIdempotencyReceipt receipt);
}
