package com.hamcheeze.vote.survey.domain.consent;

import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;

import java.time.Instant;
import java.util.Objects;

public record SurveyConsentDocument(
        SurveyRoundId roundId,
        String documentCode,
        String documentVersion,
        String title,
        String content,
        String contentHash,
        Instant publishedAt
) {

    public SurveyConsentDocument {
        Objects.requireNonNull(roundId, "roundId");
        documentCode = required(documentCode, "documentCode", 100);
        documentVersion = required(
                documentVersion, "documentVersion", 100);
        title = required(title, "title", 255);
        content = required(content, "content", 100_000);
        contentHash = required(contentHash, "contentHash", 64);
        if (!contentHash.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(
                    "contentHash must be lowercase SHA-256 hex");
        }
        Objects.requireNonNull(publishedAt, "publishedAt");
    }

    private static String required(
            String value,
            String field,
            int maximumLength
    ) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip();
        if (normalized.isEmpty() || normalized.length() > maximumLength) {
            throw new IllegalArgumentException(
                    field + " must contain 1.." + maximumLength
                            + " characters");
        }
        return normalized;
    }
}
