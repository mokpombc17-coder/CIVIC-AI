package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.survey.application.consent.SurveyConsentService;
import com.hamcheeze.vote.survey.domain.consent.SurveyConsentDocument;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

final class SurveyConsentApiModels {

    private SurveyConsentApiModels() {
    }

    record AcceptConsentRequest(
            @NotBlank @Size(max = 100) String documentCode,
            @NotBlank @Size(max = 100) String documentVersion,
            @NotNull UUID roundId,
            Instant clientClickedAt
    ) {
    }

    record AcceptConsentResponse(
            UUID consentReceiptId,
            Instant acceptedAt
    ) {
        static AcceptConsentResponse from(
                SurveyConsentService.Acceptance acceptance
        ) {
            return new AcceptConsentResponse(
                    acceptance.receipt().id().value(),
                    acceptance.receipt().acceptedAt());
        }
    }

    record ConsentDocumentResponse(
            UUID roundId,
            String documentCode,
            String documentVersion,
            String title,
            String content,
            String contentHash,
            Instant publishedAt
    ) {
        static ConsentDocumentResponse from(
                SurveyConsentDocument document
        ) {
            return new ConsentDocumentResponse(
                    document.roundId().value(),
                    document.documentCode(),
                    document.documentVersion(),
                    document.title(),
                    document.content(),
                    document.contentHash(),
                    document.publishedAt());
        }
    }

    record PublishConsentDocumentRequest(
            @NotBlank @Size(max = 100) String documentCode,
            @NotBlank @Size(max = 100) String documentVersion,
            @NotBlank @Size(max = 255) String title,
            @NotBlank @Size(max = 100_000) String content
    ) {
    }
}
