package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.security.AuthenticatedUserIdResolver;
import com.hamcheeze.vote.survey.application.query.CurrentSurveyQueryService;
import com.hamcheeze.vote.survey.application.query.MySurveyResponseQueryService;
import com.hamcheeze.vote.survey.application.query.SurveyEligibilityQueryService;
import com.hamcheeze.vote.survey.application.content.SurveyContentVersionService;
import com.hamcheeze.vote.survey.application.preview.SurveyPreviewMode;
import com.hamcheeze.vote.survey.application.response.SurveyResponseSubmissionService;
import com.hamcheeze.vote.survey.application.response.SurveySubmissionOutcome;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceEligibilityDecision;
import com.hamcheeze.vote.survey.domain.eligibility.SurveyRequirement;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/me")
final class SurveyUserController {

    private final AuthenticatedUserIdResolver userIds;
    private final CurrentSurveyQueryService currentSurveys;
    private final SurveyResponseSubmissionService submissions;
    private final MySurveyResponseQueryService responses;
    private final SurveyEligibilityQueryService eligibility;
    private final SurveyContentVersionService contents;
    private final SurveyPreviewMode previewMode;

    SurveyUserController(
            AuthenticatedUserIdResolver userIds,
            CurrentSurveyQueryService currentSurveys,
            SurveyResponseSubmissionService submissions,
            MySurveyResponseQueryService responses,
            SurveyEligibilityQueryService eligibility,
            SurveyContentVersionService contents,
            SurveyPreviewMode previewMode
    ) {
        this.userIds = userIds;
        this.currentSurveys = currentSurveys;
        this.submissions = submissions;
        this.responses = responses;
        this.eligibility = eligibility;
        this.contents = contents;
        this.previewMode = previewMode;
    }

    @GetMapping("/surveys/current")
    SurveyApiModels.CurrentSurveyResponse current(
            Authentication authentication
    ) {
        CurrentSurveyQueryService.CurrentSurveyResult result =
                currentSurveys.findCurrent(userId(authentication));
        CurrentSurveyQueryService.CurrentSurvey current = result.current()
                .orElseThrow(SurveyUserController::activeRoundUnavailable);
        return new SurveyApiModels.CurrentSurveyResponse(
                SurveyApiModels.CurrentRoundResponse.from(current.round()),
                SurveyApiModels.PublishedContentResponse.from(
                        current.contentVersion()),
                current.submitted(),
                SurveyApiModels.EligibilityResponse.from(
                        result.eligibility()));
    }

    @PostMapping("/survey-responses")
    ResponseEntity<?> submit(
            Authentication authentication,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody SurveyApiModels.SubmitResponseRequest request,
            HttpServletRequest httpRequest
    ) {
        SurveyUserId userId = userId(authentication);
        SurveyResponseSubmissionService.SubmitSurveyResponseCommand command =
                new SurveyResponseSubmissionService
                        .SubmitSurveyResponseCommand(
                        new SurveyRoundId(request.roundId()),
                        request.toAnswers());
        SurveyResponseSubmissionService.SubmissionExecution execution =
                previewMode.enabledFor(userId)
                ? submissions.submitPreview(
                        userId,
                        idempotencyKey,
                        command)
                : submissions.submit(userId, idempotencyKey, command);
        SurveySubmissionOutcome outcome = execution.outcome();
        if (!outcome.succeeded()) {
            HttpStatus status = HttpStatus.valueOf(outcome.httpStatus());
            return ResponseEntity.status(status).body(
                    SurveyProblemDetails.create(
                            status,
                            outcome.code(),
                            "The survey response was rejected.",
                            URI.create(httpRequest.getRequestURI()),
                            execution.replayed(),
                            outcome.violations()));
        }
        return ResponseEntity.status(outcome.httpStatus()).body(
                new SurveyApiModels.SubmissionResponse(
                        outcome.code(), execution.replayed(),
                        outcome.responseId().value(),
                        outcome.roundId().value(),
                        outcome.contentVersionId().value(),
                        outcome.submittedAt()));
    }

    @GetMapping("/survey-responses/latest")
    SurveyApiModels.ResponseDetail latest(Authentication authentication) {
        return responses.findLatest(userId(authentication))
                .map(this::responseDetail)
                .orElseThrow(() -> new SurveyApiException(
                        HttpStatus.NOT_FOUND,
                        "SURVEY_RESPONSE_NOT_FOUND",
                        "No survey response exists for the authenticated user."));
    }

    @GetMapping("/survey-responses")
    List<SurveyApiModels.ResponseSummary> history(
            Authentication authentication
    ) {
        return SurveyApiModels.history(
                responses.findHistory(userId(authentication)));
    }

    @GetMapping("/survey-responses/{responseId}")
    SurveyApiModels.ResponseDetail detail(
            Authentication authentication,
            @PathVariable UUID responseId
    ) {
                return responses.findDetail(
                        userId(authentication),
                        new SurveyResponseId(responseId))
                .map(this::responseDetail)
                .orElseThrow(() -> new SurveyApiException(
                        HttpStatus.NOT_FOUND,
                        "SURVEY_RESPONSE_NOT_FOUND",
                        "The survey response does not exist."));
    }

    @GetMapping("/service-eligibility")
    SurveyApiModels.EligibilityResponse eligibility(
            Authentication authentication
    ) {
        ServiceEligibilityDecision decision = eligibility.evaluate(
                userId(authentication));
        if (decision.surveyRequirement() == SurveyRequirement.UNAVAILABLE) {
            throw activeRoundUnavailable();
        }
        return SurveyApiModels.EligibilityResponse.from(decision);
    }

    private SurveyUserId userId(Authentication authentication) {
        return new SurveyUserId(userIds.resolve(authentication));
    }

    private SurveyApiModels.ResponseDetail responseDetail(
            SurveyResponse response
    ) {
        return SurveyApiModels.ResponseDetail.from(
                response,
                contents.findById(new SurveyContentVersionId(
                                response.contentVersionId().value()))
                        .orElseThrow(() -> new SurveyApiException(
                                HttpStatus.CONFLICT,
                                "SURVEY_RESPONSE_CONTENT_UNAVAILABLE",
                                "The response content version is unavailable.")));
    }

    private static SurveyApiException activeRoundUnavailable() {
        return new SurveyApiException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "SURVEY_ACTIVE_ROUND_UNAVAILABLE",
                "Exactly one active survey round is required.");
    }
}
