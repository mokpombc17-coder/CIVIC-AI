package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.survey.application.consent.SurveyConsentService;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/survey-rounds")
final class SurveyConsentAdminController {

    private final SurveyConsentService consents;

    SurveyConsentAdminController(SurveyConsentService consents) {
        this.consents = consents;
    }

    @PutMapping("/{roundId}/consent-document")
    SurveyConsentApiModels.ConsentDocumentResponse publish(
            @PathVariable UUID roundId,
            @Valid @RequestBody
            SurveyConsentApiModels.PublishConsentDocumentRequest request
    ) {
        return SurveyConsentApiModels.ConsentDocumentResponse.from(
                consents.publishDocument(
                        new SurveyRoundId(roundId),
                        request.documentCode(),
                        request.documentVersion(),
                        request.title(),
                        request.content()));
    }
}
