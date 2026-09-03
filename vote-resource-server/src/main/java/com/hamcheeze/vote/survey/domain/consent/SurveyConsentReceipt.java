package com.hamcheeze.vote.survey.domain.consent;

import com.hamcheeze.vote.survey.domain.common.ConsentReceiptId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public record SurveyConsentReceipt(
        ConsentReceiptId id,
        SurveyUserId userId,
        SurveyRoundId roundId,
        String documentCode,
        String documentVersion,
        String documentContentSnapshot,
        String documentHash,
        Instant acceptedAt,
        Instant clientClickedAt,
        UUID idempotencyKey,
        String requestHash
) {

    public SurveyConsentReceipt {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(roundId, "roundId");
        Objects.requireNonNull(documentCode, "documentCode");
        Objects.requireNonNull(documentVersion, "documentVersion");
        Objects.requireNonNull(documentContentSnapshot,
                "documentContentSnapshot");
        Objects.requireNonNull(documentHash, "documentHash");
        Objects.requireNonNull(acceptedAt, "acceptedAt");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        Objects.requireNonNull(requestHash, "requestHash");
    }

    public Optional<Instant> optionalClientClickedAt() {
        return Optional.ofNullable(clientClickedAt);
    }
}
