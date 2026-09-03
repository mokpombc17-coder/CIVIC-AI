package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.survey.application.consent.SurveyConsentService;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/me")
final class SurveyConsentController {

    private final AuthenticatedUserIdResolver userIds;
    private final SurveyConsentService consents;

    SurveyConsentController(
            AuthenticatedUserIdResolver userIds,
            SurveyConsentService consents
    ) {
        this.userIds = userIds;
        this.consents = consents;
    }

    @GetMapping("/survey-consent-documents/current")
    SurveyConsentApiModels.ConsentDocumentResponse currentDocument(
            Authentication authentication,
            @RequestParam UUID roundId
    ) {
        userIds.resolve(authentication);
        return SurveyConsentApiModels.ConsentDocumentResponse.from(
                consents.findCurrentDocument(new SurveyRoundId(roundId)));
    }

    @PostMapping("/survey-consents")
    ResponseEntity<SurveyConsentApiModels.AcceptConsentResponse> accept(
            Authentication authentication,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody
            SurveyConsentApiModels.AcceptConsentRequest request
    ) {
        SurveyUserId userId = new SurveyUserId(
                userIds.resolve(authentication));
        SurveyConsentService.Acceptance acceptance = consents.accept(
                userId,
                idempotencyKey,
                new SurveyConsentService.AcceptConsentCommand(
                        request.documentCode(),
                        request.documentVersion(),
                        new SurveyRoundId(request.roundId()),
                        request.clientClickedAt()));
        SurveyConsentApiModels.AcceptConsentResponse body =
                SurveyConsentApiModels.AcceptConsentResponse.from(
                        acceptance);
        if (acceptance.replayed()) {
            return ResponseEntity.ok(body);
        }
        return ResponseEntity.status(201).body(body);
    }
}
