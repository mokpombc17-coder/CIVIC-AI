package com.hamcheeze.vote.survey.infra.persistence.jpa;

import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyKey;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyReceipt;
import com.hamcheeze.vote.survey.application.idempotency.SurveyRequestHash;
import com.hamcheeze.vote.survey.domain.common.SurveyReceiptId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;

final class SurveyIdempotencyJpaMapper {

    private SurveyIdempotencyJpaMapper() {
    }

    static SurveyIdempotencyReceipt toDomain(
            SurveyIdempotencyJpaEntity entity
    ) {
        return SurveyIdempotencyReceipt.rehydrate(
                new SurveyReceiptId(entity.id()),
                new SurveyUserId(entity.userId()),
                entity.operation(),
                new SurveyIdempotencyKey(entity.idempotencyKey()),
                new SurveyRequestHash(entity.requestHash()),
                entity.status(),
                entity.outcomeSchemaVersion(),
                entity.httpStatus(),
                entity.outcome(),
                entity.responseId() == null
                        ? null
                        : new SurveyResponseId(entity.responseId()),
                entity.createdAt(),
                entity.completedAt(),
                entity.expiresAt());
    }
}
